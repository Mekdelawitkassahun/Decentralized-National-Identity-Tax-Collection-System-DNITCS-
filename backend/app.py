import os
import time
import uuid
from typing import Any, Dict, Optional, Tuple

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_abi import encode as abi_encode

from fayda_py_sdk import ConfigBuilder
from fayda_py_sdk.dto import OtpRequestDTO, AuthRequestDTO


app = Flask(__name__)
CORS(app)


# --------- Configuration ----------

FAYDA_MOCK = os.getenv("FAYDA_MOCK", "false").lower() == "true"

FAYDA_ID_TYPE = os.getenv("FAYDA_ID_TYPE", "UIN")  # likely UIN/VID in Fayda; prototype assumes UIN

ATTESTER_PRIVATE_KEY = os.getenv("ATTESTER_PRIVATE_KEY", "")
if not ATTESTER_PRIVATE_KEY:
    raise RuntimeError("Missing ATTESTER_PRIVATE_KEY in backend env")

ATTESTER_ADDRESS = Account.from_key(ATTESTER_PRIVATE_KEY).address

SANCTIONS_API_URL = os.getenv("SANCTIONS_API_URL", "")

def _build_fayda_client():
    """
    Build Fayda SDK config using explicit env var mapping.

    This avoids relying on whatever env var names `ConfigBuilder.from_env()` expects.
    """
    partner_id = os.getenv("FAYDA_PARTNER_ID") or os.getenv("PARTNER_ID") or ""
    partner_api_key = os.getenv("FAYDA_API_KEY") or os.getenv("PARTNER_API_KEY") or ""
    misp_license_key = os.getenv("MISP_LICENSE_KEY") or os.getenv("FAYDA_MISP_LICENSE_KEY") or ""
    ida_reference_id = os.getenv("IDA_REFERENCE_ID") or os.getenv("FAYDA_IDA_REFERENCE_ID") or ""
    fayda_base_url = os.getenv("FAYDA_BASE_URL") or os.getenv("FAYDA_BASEURL") or "https://dev.fayda.et"
    p12_path = os.getenv("FAYDA_CERTIFICATE_PATH") or os.getenv("P12_PATH") or ""
    p12_password = os.getenv("FAYDA_CERTIFICATE_PASSWORD") or os.getenv("P12_PASSWORD") or ""

    ida_ssl_verify = os.getenv("IDA_SSL_VERIFY", "false").lower() == "true"

    missing = []
    if not partner_id:
        missing.append("FAYDA_PARTNER_ID (or PARTNER_ID)")
    if not partner_api_key:
        missing.append("FAYDA_API_KEY (or PARTNER_API_KEY)")
    if not misp_license_key:
        missing.append("MISP_LICENSE_KEY (or FAYDA_MISP_LICENSE_KEY)")
    if not ida_reference_id:
        missing.append("IDA_REFERENCE_ID (or FAYDA_IDA_REFERENCE_ID)")
    if not p12_path:
        missing.append("FAYDA_CERTIFICATE_PATH (or P12_PATH)")
    if not p12_password:
        missing.append("FAYDA_CERTIFICATE_PASSWORD (or P12_PASSWORD)")

    if missing:
        raise RuntimeError(
            "Missing Fayda SDK config env vars: " + ", ".join(missing)
        )

    cfg = {
        "partnerId": partner_id,
        "fayda.base.url": fayda_base_url,
        "mispLicenseKey": misp_license_key,
        "partnerApiKey": partner_api_key,
        "ida.reference.id": ida_reference_id,
        "p12.path": p12_path,
        "p12.password": p12_password,
        "ida.ssl.verify": ida_ssl_verify,
    }
    return ConfigBuilder().from_dict(cfg).build()


_FAYDA_CLIENT = None
if not FAYDA_MOCK:
    _FAYDA_CLIENT = _build_fayda_client()


# --------- Tiny in-memory rate limiter ----------

_RATE_LIMIT_WINDOW_SEC = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))
_RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "20"))
_rate_bucket: Dict[str, list] = {}


def _rate_limit(ip: str) -> bool:
    now = time.time()
    bucket = _rate_bucket.setdefault(ip, [])
    # keep only timestamps within window
    bucket[:] = [t for t in bucket if now - t <= _RATE_LIMIT_WINDOW_SEC]
    if len(bucket) >= _RATE_LIMIT_MAX:
        return False
    bucket.append(now)
    return True


# --------- Helpers ----------

def _require_json(keys: Tuple[str, ...]) -> Tuple[Optional[Dict[str, Any]], Optional[tuple]]:
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return None, ("Invalid JSON", 400)

    for k in keys:
        if k not in data:
            return None, (f"Missing field: {k}", 400)
    return data, None


def _fayda_hash(fayda_number: str) -> str:
    n = int(fayda_number)
    return "0x" + Web3.solidity_keccak(["uint256"], [n]).hex()


def _parse_age(obj: Any) -> int:
    """
    Best-effort age extraction from SDK response.
    """
    if obj is None:
        return 0
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and k.lower() == "age":
                try:
                    return int(v)
                except Exception:
                    continue
            out = _parse_age(v)
            if out:
                return out
    elif isinstance(obj, list):
        for it in obj:
            out = _parse_age(it)
            if out:
                return out
    return 0


def _build_attestation_digest(
    attestation_id: str,
    wallet_address: str,
    fayda_hash: str,
    age: int,
    fayda_verified: bool,
    on_sanctions_list: bool,
    tax_category: int,
    business_type: int,
    area: int,
    linked_bank_account: str,
) -> bytes:
    """
    Mirror solidity abi.encode(...) digest for NationalIdentity.registerAndAutoApprove().
    """
    types = [
        "bytes32",
        "address",
        "bytes32",
        "uint8",
        "bool",
        "bool",
        "uint8",
        "uint8",
        "uint8",
        "address",
    ]

    values = [
        Web3.to_bytes(hexstr=attestation_id),
        wallet_address,
        Web3.to_bytes(hexstr=fayda_hash),
        age,
        fayda_verified,
        on_sanctions_list,
        tax_category,
        business_type,
        area,
        linked_bank_account,
    ]

    encoded = abi_encode(types, values)  # matches Solidity abi.encode(...)
    digest = Web3.keccak(encoded)
    return digest


def _sign_digest(digest_32: bytes) -> str:
    """
    Sign exactly what solidity verifies:
      digest.toEthSignedMessageHash().recover(signature)
    """
    msg = encode_defunct(primitive=digest_32)
    signed = Account.sign_message(msg, ATTESTER_PRIVATE_KEY)
    # signed.signature is 65 bytes; return hex string
    return "0x" + signed.signature.hex()


def _bank_reference_to_address(bank_name: str, account_holder: str, account_number: str) -> str:
    """
    Convert real-world bank reference fields into a deterministic 20-byte address-like value
    so the existing Solidity field type (address) remains compatible.
    """
    seed = f"{bank_name.strip().lower()}|{account_holder.strip().lower()}|{account_number.strip()}"
    h = Web3.keccak(text=seed).hex()  # 0x + 64 hex chars
    return "0x" + h[-40:]


# --------- API ----------


@app.post("/api/fayda/request-otp")
def request_otp():
    ip = request.headers.get("x-forwarded-for", request.remote_addr or "unknown")
    if not _rate_limit(ip):
        return jsonify({"error": "Rate limited"}), 429

    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    # Backward-compatible field support:
    # - preferred: faydaNumber
    # - alias: faydaId
    fayda_number = str(data.get("faydaNumber") or data.get("faydaId") or "").strip()
    if not fayda_number:
        return jsonify({"error": "Missing field: faydaNumber (or faydaId)"}), 400
    if not fayda_number.isdigit() or len(fayda_number) != 16:
        return jsonify({"error": "faydaNumber must be a 16-digit numeric ID"}), 400

    # Keep old clients working even if they omit channel/walletAddress.
    channel = str(data.get("channel") or "PHONE").upper()

    if not FAYDA_MOCK:
        # Map to SDK channel names (prototype keeps it simple).
        otp_channel = ["PHONE"] if channel == "PHONE" else ["EMAIL"]

        otp_request = OtpRequestDTO(
            individual_id=fayda_number,
            individual_id_type=FAYDA_ID_TYPE,
            otp_channel=otp_channel,
        )
        resp = _FAYDA_CLIENT.request_otp(otp_request)

        # Best-effort masking fields
        masked = (
            resp.get("response", {}).get("maskedMobile")
            or resp.get("response", {}).get("maskedEmail")
            or ""
        )
        return jsonify({"maskedContact": masked})

    # Mock mode (dev only): expose deterministic OTP for frontend testing UX.
    # Never do this in real mode.
    return jsonify(
        {
            "success": True,
            "requestId": fayda_number,
            "message": "OTP generated (mock mode)",
            "maskedContact": "OTP will be sent (mock)",
            "otp": "123456",
        }
    ), 200


@app.post("/api/fayda/verify-otp")
def verify_otp():
    ip = request.headers.get("x-forwarded-for", request.remote_addr or "unknown")
    if not _rate_limit(ip):
        return jsonify({"error": "Rate limited"}), 429

    data, err = _require_json(
        (
            "otp",
            "walletAddress",
            "fullName",
            "taxCategory",
            "businessType",
            "location",
            "linkedBankAccount",
            "tinNumber",
        )
    )
    if err:
        msg, code = err
        return jsonify({"error": msg}), code

    fayda_number = str(data.get("faydaNumber") or data.get("faydaId") or "")
    if not fayda_number:
        return jsonify({"error": "Missing field: faydaNumber (or faydaId)"}), 400
    otp = str(data["otp"])
    wallet_address = str(data["walletAddress"])
    full_name = str(data["fullName"])

    claimed_tax_category = int(data["taxCategory"])
    business_type = int(data["businessType"])
    area = int(data["location"])
    linked_bank_account = str(data["linkedBankAccount"])
    tin_number = str(data["tinNumber"])
    bank_name = str(data.get("bankName", ""))
    account_holder_name = str(data.get("accountHolderName", ""))
    bank_account_number = str(data.get("bankAccountNumber", ""))
    if claimed_tax_category != 0 and not tin_number.strip():
        return jsonify({"error": "TIN / business registry number is required"}), 400

    def derive_tax_category_from_tin_mock(tin: str) -> int:
        # Deterministic mock classification using pseudo annual revenue from TIN:
        # revenue = last 6 digits * 10 ETB
        # MICRO < 500,000 ETB else CATEGORY_B
        try:
            tail = int("".join([c for c in tin if c.isdigit()])[-6:] or "0")
        except Exception:
            tail = 0
        annual_revenue_etb = tail * 10
        return 3 if annual_revenue_etb < 500000 else 2

    def derive_tax_category_from_tin_real(tin: str) -> int:
        # Real classification requires a business registry (or tax authority) endpoint.
        registry_url = os.getenv("BUSINESS_REGISTRY_API_URL", "")
        registry_key = os.getenv("BUSINESS_REGISTRY_API_KEY", "")
        if not registry_url or not registry_key:
            raise RuntimeError(
                "BUSINESS_REGISTRY_API_URL and BUSINESS_REGISTRY_API_KEY must be set for real category derivation"
            )

        r = requests.post(
            registry_url.rstrip("/") + "/category/derive",
            json={"tinNumber": tin},
            headers={"Authorization": f"Bearer {registry_key}"},
            timeout=20,
        )
        if not r.ok:
            raise RuntimeError(f"Business registry derive failed: {r.status_code}")
        payload = r.json()
        if "category" in payload:
            cat = str(payload["category"]).upper()
            if cat == "MICRO":
                return 3
            if cat == "CATEGORY_B":
                return 2
        if "annualRevenue" in payload:
            annual = float(payload["annualRevenue"])
            return 3 if annual < 500000 else 2
        raise RuntimeError("Unrecognized business registry response")

    # Authoritative derive (prevents UI lying Micro vs Category B)
    if claimed_tax_category in (2, 3):
        derived_tax_category = (
            derive_tax_category_from_tin_mock(tin_number)
            if FAYDA_MOCK
            else derive_tax_category_from_tin_real(tin_number)
        )
    else:
        derived_tax_category = claimed_tax_category
    derive_note = "TIN-based category derivation applied" if claimed_tax_category in (2, 3) else "Category accepted as provided"

    zero_addr = "0x0000000000000000000000000000000000000000"
    effective_linked_bank_account = zero_addr
    if derived_tax_category == 1:
        if (
            Web3.is_address(linked_bank_account)
            and linked_bank_account.lower() != zero_addr
        ):
            effective_linked_bank_account = Web3.to_checksum_address(linked_bank_account)
        elif bank_name.strip() and account_holder_name.strip() and bank_account_number.strip():
            effective_linked_bank_account = _bank_reference_to_address(
                bank_name, account_holder_name, bank_account_number
            )
        else:
            effective_linked_bank_account = zero_addr

    # Basic validation for derived inputs.
    if derived_tax_category < 0 or derived_tax_category > 3:
        return jsonify({"error": "Invalid taxCategory"}), 400
    if business_type < 0 or business_type > 5:
        return jsonify({"error": "Invalid businessType"}), 400
    if area < 0 or area > 12:
        return jsonify({"error": "Invalid location"}), 400

    if derived_tax_category == 1:
        if effective_linked_bank_account.lower() == zero_addr:
            return jsonify({"error": "Category A requires a non-zero bank account reference"}), 400
    else:
        if effective_linked_bank_account.lower() != zero_addr:
            return jsonify({"error": "Only Category A uses linkedBankAccount"}), 400

    fayda_hash = _fayda_hash(fayda_number)

    fayda_verified = False
    on_sanctions_list = False
    age = 0

    if not FAYDA_MOCK:
        auth_request = AuthRequestDTO(
            individual_id=fayda_number,
            individual_id_type=FAYDA_ID_TYPE,
            otp=otp,
        )
        auth_resp = _FAYDA_CLIENT.yes_no_auth(auth_request)

        # Determine verification status
        auth_status = False
        try:
            auth_status = bool(auth_resp.get("response", {}).get("authStatus"))
        except Exception:
            auth_status = False
        fayda_verified = auth_status

        # Fetch eKYC demographics (age is required by your eligibility rules)
        ekyc_resp = _FAYDA_CLIENT.perform_ekyc(auth_request)
        age = _parse_age(ekyc_resp)

        # Optional sanctions check
        if SANCTIONS_API_URL:
            try:
                r = requests.post(
                    SANCTIONS_API_URL,
                    json={"faydaHash": fayda_hash, "walletAddress": wallet_address, "fullName": full_name},
                    timeout=15,
                )
                if r.ok:
                    on_sanctions_list = bool(r.json().get("onSanctionsList", False))
            except Exception:
                on_sanctions_list = False

    else:
        # Mock mode: deterministic but still goes through signature attestation.
        fayda_verified = True
        on_sanctions_list = False
        age = 25

    # Build attestation for contract signature verification
    attestation_id = "0x" + Web3.keccak(text=str(uuid.uuid4())).hex()
    digest = _build_attestation_digest(
        attestation_id=attestation_id,
        wallet_address=wallet_address,
        fayda_hash=fayda_hash,
        age=age,
        fayda_verified=fayda_verified,
        on_sanctions_list=on_sanctions_list,
        tax_category=derived_tax_category,
        business_type=business_type,
        area=area,
        linked_bank_account=effective_linked_bank_account,
    )
    signature = _sign_digest(digest)
    return jsonify(
        {
            "attestationId": attestation_id,
            "faydaHash": fayda_hash,
            "age": age,
            "faydaVerified": fayda_verified,
            "onSanctionsList": on_sanctions_list,
            "signature": signature,
            "attesterAddress": ATTESTER_ADDRESS,
            "derivedTaxCategory": derived_tax_category,
            "derivedBusinessType": business_type,
            "effectiveLinkedBankAccount": effective_linked_bank_account,
            "derivedLocation": area,
            "deriveNote": derive_note,
        }
    )


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)

