import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import useWallet from '../hooks/useWallet';
import {
  User,
  ShieldCheck,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Wallet,
  Bell,
} from 'lucide-react';

type Lang = 'en' | 'am';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const CitizenPortal = () => {
  const {
    address,
    connectWallet,
    nationalIdentityContract,
    staticTaxHandlerContract,
    loading,
    balance,
    isCitizen,
    isAdmin,
    isEmployer,
    isTaxCollector,
  } = useWallet();

  const [lang, setLang] = useState<Lang>('en');

  const t = useMemo(() => {
    const dict: Record<Lang, Record<string, string>> = {
      en: {
        title: 'Citizen Portal',
        connect: 'Connect wallet to continue',
        fullName: 'Full legal name',
        faydaId: '16-digit Fayda ID',
        requestOtp: 'Request OTP',
        verifyOtp: 'Verify OTP & Register',
        otp: 'OTP',
        category: 'Tax category',
        bankAccount: 'Bank account reference (Category A)',
        businessType: 'Business type',
        location: 'Location (Category B)',
        government: 'Government employees',
        categoryA: 'Category A (Large business)',
        categoryB: 'Category B (Small business)',
        micro: 'Micro business',
        status: 'Verification pipeline',
        autoApproved: 'Auto-approved',
        manualReview: 'Manual review required',
        due: 'Tax due now',
        payTax: 'Pay tax',
        taxPaid: 'Total tax paid',
      },
      am: {
        title: 'የዜጋ ፖርታል',
        connect: 'ለመቀጠል ዋሌት ይግቡ',
        fullName: 'ሙሉ ህጋዊ ስም',
        faydaId: '16 ዲጂት የፋይዳ መታወቂያ',
        requestOtp: 'OTP ይጠይቁ',
        verifyOtp: 'OTP ያረጋግጡ እና ይመዝግቡ',
        otp: 'OTP',
        category: 'የታክስ ምድብ',
        bankAccount: 'የባንክ መለያ ማጣቀሻ (ምድብ A)',
        businessType: 'የንግድ አይነት',
        location: 'አካባቢ (ምድብ B)',
        government: 'የመንግስት ሰራተኞች',
        categoryA: 'ምድብ A (ትልቅ ንግድ)',
        categoryB: 'ምድብ B (ትንሽ ንግድ)',
        micro: 'ማይክሮ ንግድ',
        status: 'የማረጋገጫ ፍሰት',
        autoApproved: 'በራስ የተፈቀደ',
        manualReview: 'ለሰው ግምገማ ያስፈልጋል',
        due: 'ታክስ አሁን ይከፈል',
        payTax: 'ታክስ ክፈሉ',
        taxPaid: 'አጠቃላይ ያስከፈሉ',
      },
    };
    return dict[lang];
  }, [lang]);

  const [fullName, setFullName] = useState('');
  const [faydaNumber, setFaydaNumber] = useState('');

  // Enums in solidity:
  // TaxCategory: GOVERNMENT=0, CATEGORY_A=1, CATEGORY_B=2, MICRO=3
  const [taxCategory, setTaxCategory] = useState<number>(2);
  // BusinessType: RETAIL_SHOP=0, RESTAURANT=1, TAXI=2, WHOLESALE=3, MANUFACTURING=4, OTHER=5
  const [businessType, setBusinessType] = useState<number>(0);
  const [businessTypeOtherText, setBusinessTypeOtherText] = useState<string>('');
  // Location enum indices (matches solidity)
  // ADDIS_ABABA=0, AFAR=1, AMHARA=2, BENISHANGUL_GUMUZ=3, CENTRAL_ETHIOPIA=4, GAMBELLA=5,
  // HARARI=6, OROMIA=7, SIDAMA=8, SOMALI=9, SOUTH_ETHIOPIA=10, SOUTH_WEST_ETHIOPIA=11, TIGRAY=12
  const [location, setLocation] = useState<number>(0);
  const [linkedBankAccount, setLinkedBankAccount] = useState<string>(ZERO_ADDRESS);
  const [bankName, setBankName] = useState<string>('');
  const [accountHolderName, setAccountHolderName] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [tinNumber, setTinNumber] = useState<string>('');

  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpMask, setOtpMask] = useState('');
  const [requestedOtp, setRequestedOtp] = useState('');

  const [isRegistered, setIsRegistered] = useState(false);
  const [isFaydaVerified, setIsFaydaVerified] = useState(false);
  const [isAutoApproved, setIsAutoApproved] = useState(false);
  const [needsManualReview, setNeedsManualReview] = useState(false);
  const [taxCategoryOnChain, setTaxCategoryOnChain] = useState<number>(0);

  const [taxPaidWei, setTaxPaidWei] = useState<bigint>(0n);
  const [dueWei, setDueWei] = useState<bigint>(0n);
  const [receipts, setReceipts] = useState<
    Array<{ kind: 'tax' | 'withhold'; amountWei: bigint; blockNumber: number }>
  >([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [txMessage, setTxMessage] = useState<string>('');
  const [derivedCategoryNotice, setDerivedCategoryNotice] = useState<string>('');

  const refresh = async () => {
    if (!address || !nationalIdentityContract || !staticTaxHandlerContract) return;
    try {
      const c = await nationalIdentityContract.getCitizenPublic(address);
      const [cat, faydaVerified, autoApproved, manualReview, _approvalTs, registrationTime] = c;

      setIsRegistered(Number(registrationTime) > 0);
      setTaxCategoryOnChain(Number(cat));
      setIsFaydaVerified(!!faydaVerified);
      setIsAutoApproved(!!autoApproved);
      setNeedsManualReview(!!manualReview);

      const record = await staticTaxHandlerContract.getTaxRecord(address);
      const [_exists, totalTaxPaid, _lastTs] = record;
      setTaxPaidWei(totalTaxPaid);

      // Recent receipts from events (prototype: last few blocks)
      try {
        const latest = await staticTaxHandlerContract.provider.getBlockNumber();
        const fromBlock = Math.max(0, latest - 5000);
        const [taxPaidEvents, withholdEvents] = await Promise.all([
          staticTaxHandlerContract.queryFilter(
            staticTaxHandlerContract.filters.TaxPaid(address),
            fromBlock,
            'latest'
          ),
          staticTaxHandlerContract.queryFilter(
            staticTaxHandlerContract.filters.EmployerWithholding(null, address),
            fromBlock,
            'latest'
          ),
        ]);

        const mapped = [
          ...taxPaidEvents.map((ev: any) => ({
            kind: 'tax' as const,
            amountWei: ev.args[1] as bigint,
            blockNumber: ev.blockNumber,
          })),
          ...withholdEvents.map((ev: any) => ({
            kind: 'withhold' as const,
            amountWei: ev.args[2] as bigint,
            blockNumber: ev.blockNumber,
          })),
        ].sort((a, b) => b.blockNumber - a.blockNumber);

        setReceipts(mapped.slice(0, 6));
      } catch {
        // Non-fatal: receipts are optional in case event querying fails.
        setReceipts([]);
      }

      const shouldShowDue = autoApproved && (Number(cat) === 2 || Number(cat) === 3); // CATEGORY_B or MICRO
      if (shouldShowDue) {
        const due = await staticTaxHandlerContract.taxDueNow(address);
        setDueWei(due);
      } else {
        setDueWei(0n);
      }
    } catch (e) {
      setIsRegistered(false);
      setIsFaydaVerified(false);
      setIsAutoApproved(false);
      setNeedsManualReview(false);
      setTaxCategoryOnChain(0);
      setTaxPaidWei(0n);
      setDueWei(0n);
    }
  };

  useEffect(() => {
    if (!loading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, loading, nationalIdentityContract, staticTaxHandlerContract]);

  useEffect(() => {
    // Ensure bank account reference is valid for Category A; others will be forced to ZERO.
    if (taxCategory === 1 && linkedBankAccount !== ZERO_ADDRESS && ethers.isAddress(linkedBankAccount)) return;
    if (taxCategory !== 1) setLinkedBankAccount(ZERO_ADDRESS);
  }, [taxCategory, linkedBankAccount]);

  const categoryLabel = (cat: number) => {
    if (cat === 0) return t.government;
    if (cat === 1) return t.categoryA;
    if (cat === 2) return t.categoryB;
    return t.micro;
  };

  const requestOtp = async () => {
    if (!faydaNumber || !/^\d{16}$/.test(faydaNumber)) return alert('Please enter a valid 16-digit Fayda ID.');
    if (!address) return alert(t.connect);

    setIsProcessing(true);
    setTxMessage('');
    try {
      const res = await fetch('/api/fayda/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faydaNumber, channel: 'PHONE', walletAddress: address }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'OTP request failed');
      setOtpRequested(true);
      setOtpMask(data.maskedContact || '');
      // Auto-fill in test/mock environments even if backend omits explicit `otp`.
      const looksMock =
        String(data?.message || '').toLowerCase().includes('mock') ||
        String(data?.maskedContact || '').toLowerCase().includes('mock');
      const returnedOtp = typeof data?.otp === 'string' ? data.otp : (looksMock ? '123456' : '');
      setRequestedOtp(returnedOtp);
      if (returnedOtp) {
        // Testing convenience in mock mode.
        setOtp(returnedOtp);
      }
      setTxMessage('');
    } catch (e: any) {
      setTxMessage(e?.message || 'Failed to request OTP');
      setOtpRequested(false);
      setRequestedOtp('');
    } finally {
      setIsProcessing(false);
    }
  };

  const verifyAndRegister = async () => {
    if (!address) return alert(t.connect);
    if (!nationalIdentityContract) return;
    if (!faydaNumber || !/^\d{16}$/.test(faydaNumber)) return alert('Invalid Fayda ID');
    if (!otpRequested) return alert('Please request OTP first.');
    if (!otp || otp.length < 4) return alert('Enter the OTP you received.');
    if (!fullName.trim()) return alert('Name is required');
    if (taxCategory !== 0 && !tinNumber.trim()) return alert('TIN / business registry number is required.');

    if (taxCategory === 1) {
      const hasAddressRef = !!linkedBankAccount && ethers.isAddress(linkedBankAccount);
      const hasBankDetails =
        !!bankName.trim() && !!accountHolderName.trim() && !!bankAccountNumber.trim();
      if (!hasAddressRef && !hasBankDetails) {
        return alert('For Category A, provide either an EVM address reference OR bank name + account holder + account number.');
      }
    } else {
      setLinkedBankAccount(ZERO_ADDRESS);
      setBankName('');
      setAccountHolderName('');
      setBankAccountNumber('');
    }

    if (taxCategory === 2 || taxCategory === 3) {
      // When user selects "Other", require a short description so the selection is intentional.
      if (businessType === 5 && !businessTypeOtherText.trim()) {
        return alert('Please describe your business type (Other).');
      }
    }

    setIsProcessing(true);
    setTxMessage('');
    try {
      const res = await fetch('/api/fayda/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faydaNumber,
          otp,
          walletAddress: address,
          fullName,
          taxCategory,
          businessType,
          location,
          linkedBankAccount: taxCategory === 1 ? linkedBankAccount : ZERO_ADDRESS,
          bankName: bankName.trim(),
          accountHolderName: accountHolderName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          businessTypeOtherText: businessTypeOtherText.trim(),
          tinNumber: tinNumber.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'OTP verification failed');

      const {
        attestationId,
        faydaHash,
        age,
        faydaVerified,
        onSanctionsList,
        signature,
        attesterAddress,
        derivedTaxCategory,
        derivedBusinessType,
        derivedLocation,
        effectiveLinkedBankAccount,
        deriveNote,
      } = data;

      const regTaxCategory = Number(derivedTaxCategory ?? taxCategory);
      const regBusinessType = Number(derivedBusinessType ?? businessType);
      const regLocation = Number(derivedLocation ?? location);
      const regLinkedBankAccount =
        (effectiveLinkedBankAccount as string) ??
        (taxCategory === 1 ? linkedBankAccount : ZERO_ADDRESS);
      if (Number(regTaxCategory) !== Number(taxCategory)) {
        setDerivedCategoryNotice(
          `TIN-derived category changed from ${categoryLabel(taxCategory)} to ${categoryLabel(regTaxCategory)}.`
        );
      } else if (typeof deriveNote === 'string' && deriveNote) {
        setDerivedCategoryNotice(deriveNote);
      } else {
        setDerivedCategoryNotice('');
      }

      // Preflight checks to avoid opaque MetaMask "execution reverted" failures.
      let onChainAttester: string;
      try {
        onChainAttester = await nationalIdentityContract.faydaAttester();
      } catch {
        throw new Error(
          'Connected contract is incompatible on this network. Switch to Localhost 8545 or redeploy Sepolia and update contracts.ts.'
        );
      }
      if (!onChainAttester || onChainAttester === ZERO_ADDRESS) {
        throw new Error('Contract faydaAttester is not configured on this network.');
      }
      if (
        typeof attesterAddress === 'string' &&
        ethers.isAddress(attesterAddress) &&
        ethers.getAddress(attesterAddress) !== ethers.getAddress(onChainAttester)
      ) {
        throw new Error(
          `Attester mismatch: backend signs with ${attesterAddress}, but contract expects ${onChainAttester}.`
        );
      }

      setTxMessage('Submitting registration transaction...');
      const tx = await nationalIdentityContract.registerAndAutoApprove(
        attestationId,
        fullName,
        faydaHash,
        age,
        faydaVerified,
        onSanctionsList,
        regTaxCategory,
        regBusinessType,
        regLocation,
        regLinkedBankAccount,
        signature
      );

      await tx.wait();
      setTxMessage('Registration submitted successfully.');
      setOtpRequested(false);
      setOtp('');
      setOtpMask('');
      setRequestedOtp('');
      refresh();
    } catch (e: any) {
      setTxMessage(e?.message || 'Registration failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const payTax = async () => {
    if (!address || !staticTaxHandlerContract) return;
    setIsProcessing(true);
    setTxMessage('');
    try {
      const due = await staticTaxHandlerContract.taxDueNow(address);
      if (due <= 0n) throw new Error('No tax due');
      setTxMessage('Sending payment transaction...');
      const tx = await staticTaxHandlerContract.payTax({ value: due });
      await tx.wait();
      setTxMessage('Payment confirmed.');
      await refresh();
    } catch (e: any) {
      setTxMessage(e?.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0a0f1d] text-white p-8">Loading Citizen Portal...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white p-6 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-ethiopia-green/20 rounded-2xl">
              <User className="w-8 h-8 text-ethiopia-green" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">{t.title}</h1>
              <p className="text-government-400 text-sm sm:text-base">
                {lang === 'en' ? 'OTP-based identity + category-based tax.' : 'በOTP ማረጋገጫ + በምድብ መሰረት ታክስ.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang((p) => (p === 'en' ? 'am' : 'en'))}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-bold"
            >
              {lang === 'en' ? 'አማ' : 'EN'}
            </button>
            <div className="relative">
              <Bell className="w-5 h-5 text-government-400" />
            </div>
          </div>
        </div>

        {!address ? (
          <div className="bg-government-900/40 p-8 rounded-3xl border border-government-800">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="w-6 h-6 text-ethiopia-blue" />
              <h2 className="text-xl font-bold">{t.connect}</h2>
            </div>
            <button
              onClick={connectWallet}
              className="w-full sm:w-auto px-6 py-3 bg-ethiopia-blue hover:bg-blue-700 rounded-xl font-bold"
            >
              Connect MetaMask
            </button>
          </div>
        ) : !isCitizen ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-8 rounded-3xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-ethiopia-yellow" />
              <h2 className="text-xl font-bold">Role Restricted</h2>
            </div>
            <p className="text-government-300 text-sm">
              This wallet is assigned to{' '}
              {isAdmin ? 'ADMIN' : isEmployer ? 'EMPLOYER' : isTaxCollector ? 'TAX COLLECTOR' : 'a privileged'} role.
              Citizen registration/payments are only for non-privileged wallets.
            </p>
          </div>
        ) : !isRegistered ? (
          <div className="space-y-6">
            <div className="bg-government-900/40 p-7 rounded-3xl border border-ethiopia-green/30 backdrop-blur-xl">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-6 h-6 text-ethiopia-green" />
                <h2 className="text-2xl font-bold">Fayda OTP Registration Wizard</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-government-300 mb-2">{t.fullName}</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                    placeholder={lang === 'en' ? 'e.g. Abebe Bikila' : 'ለምሳሌ አበበ ቢኪላ'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-government-300 mb-2">{t.faydaId}</label>
                  <input
                    type="text"
                    value={faydaNumber}
                    onChange={(e) => setFaydaNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    maxLength={16}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all font-mono"
                    placeholder="1234567890123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-government-300 mb-2">{t.category}</label>
                  <select
                    value={taxCategory}
                    onChange={(e) => setTaxCategory(Number(e.target.value))}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                  >
                    <option value={0}>{t.government}</option>
                    <option value={1}>{t.categoryA}</option>
                    <option value={2}>{t.categoryB}</option>
                    <option value={3}>{t.micro}</option>
                  </select>
                </div>

                {taxCategory === 1 && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-government-300 mb-2">{t.bankAccount}</label>
                    <input
                      type="text"
                      value={linkedBankAccount}
                      onChange={(e) => setLinkedBankAccount(e.target.value)}
                      className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all font-mono"
                      placeholder="Optional EVM address reference"
                    />
                    <p className="text-xs text-government-500 mt-2">
                      You can either provide an EVM reference address OR fill real bank details below.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                        placeholder="Bank name (e.g. CBE)"
                      />
                      <input
                        type="text"
                        value={accountHolderName}
                        onChange={(e) => setAccountHolderName(e.target.value)}
                        className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                        placeholder="Account holder name"
                      />
                      <input
                        type="text"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        className="w-full p-3 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                        placeholder="Bank account number"
                      />
                    </div>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-government-300 mb-2">
                    TIN / Business registry number
                  </label>
                  <input
                    type="text"
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value)}
                    className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all font-mono"
                    placeholder={taxCategory === 0 ? 'N/A' : 'e.g. 123456789'}
                  />
                  <p className="text-xs text-government-500 mt-2">
                    {taxCategory === 0
                      ? 'Government employees do not need TIN in this prototype.'
                      : 'Used to derive your real Micro vs Category B classification (prevents mis-declaration).'}
                  </p>
                </div>

                {(taxCategory === 2 || taxCategory === 3) && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-government-300 mb-2">{t.businessType}</label>
                      <select
                        value={businessType}
                        onChange={(e) => setBusinessType(Number(e.target.value))}
                        className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                      >
                        <option value={0}>Retail shop</option>
                        <option value={1}>Restaurant / Cafe</option>
                        <option value={2}>Taxi / Transport</option>
                        <option value={3}>Wholesale</option>
                        <option value={4}>Manufacturing / Workshop</option>
                        <option value={5}>Other</option>
                      </select>
                    </div>

                    {businessType === 5 && (
                      <div>
                        <label className="block text-sm font-medium text-government-300 mb-2">Other description</label>
                        <input
                          type="text"
                          value={businessTypeOtherText}
                          onChange={(e) => setBusinessTypeOtherText(e.target.value)}
                          className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                          placeholder={lang === 'en' ? 'Describe your business' : 'የንግድ አይነት ይግለጹ'}
                        />
                      </div>
                    )}

                    {taxCategory === 2 && (
                      <div>
                        <label className="block text-sm font-medium text-government-300 mb-2">{t.location}</label>
                        <select
                          value={location}
                          onChange={(e) => setLocation(Number(e.target.value))}
                          className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all"
                        >
                      <option value={0}>Addis Ababa</option>
                      <option value={1}>Afar</option>
                      <option value={2}>Amhara</option>
                      <option value={3}>Benishangul-Gumuz</option>
                      <option value={4}>Central Ethiopia</option>
                      <option value={5}>Gambella</option>
                      <option value={6}>Harari</option>
                      <option value={7}>Oromia</option>
                      <option value={8}>Sidama</option>
                      <option value={9}>Somali</option>
                      <option value={10}>South Ethiopia</option>
                      <option value={11}>South West Ethiopia</option>
                      <option value={12}>Tigray</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {taxCategory === 0 && (
                  <div className="md:col-span-2 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-government-300">
                    Your taxes will be deducted automatically for government employees. You won’t enter income.
                  </div>
                )}

                <div className="md:col-span-2 pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-government-300 font-bold">{lang === 'en' ? 'Step: OTP verification' : 'ደረጃ: OTP ማረጋገጥ'}</p>
                    <p className="text-xs text-government-500 font-mono">
                      {otpMask ? `Sent to: ${otpMask}` : ''}
                    </p>
                  </div>

                  {requestedOtp && (
                    <div className="mb-3 bg-blue-900/40 border border-blue-500/40 rounded-xl p-3">
                      <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">Mock Mode OTP</p>
                      <p className="text-white text-2xl font-mono font-black">{requestedOtp}</p>
                      <p className="text-government-400 text-xs mt-1">Auto-filled for testing. In real mode this is hidden.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={requestOtp}
                      disabled={isProcessing || !/^\d{16}$/.test(faydaNumber)}
                      className="w-full py-3 bg-ethiopia-green hover:bg-green-700 disabled:opacity-50 rounded-xl font-bold transition-all"
                    >
                      {isProcessing ? 'Processing...' : t.requestOtp}
                    </button>

                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="w-full p-4 bg-government-800/50 rounded-xl border border-government-700 focus:ring-2 focus:ring-ethiopia-green focus:outline-none transition-all font-mono"
                      placeholder={t.otp}
                      disabled={!otpRequested || isProcessing}
                    />
                  </div>

                  <button
                    onClick={verifyAndRegister}
                    disabled={isProcessing || !otpRequested || !otp || !fullName.trim()}
                    className="mt-3 w-full py-4 bg-ethiopia-blue hover:bg-blue-700 disabled:opacity-50 rounded-xl font-bold transition-all"
                  >
                    {isProcessing ? 'Submitting...' : t.verifyOtp}
                  </button>

                  {txMessage && (
                    <div className="mt-3 text-sm font-medium bg-white/5 border border-white/10 rounded-xl p-3">
                      {txMessage}
                    </div>
                  )}
                  {derivedCategoryNotice && (
                    <div className="mt-3 text-xs font-medium bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-yellow-200">
                      {derivedCategoryNotice}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-ethiopia-yellow mt-0.5" />
                <div>
                  <p className="text-sm text-government-300 font-bold">
                    Category: {categoryLabel(taxCategory)}
                  </p>
                  <p className="text-xs text-government-500 mt-1">
                    After successful OTP + eKYC, your registration is auto-approved when you meet the eligibility criteria.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-government-900/40 p-6 rounded-3xl border border-government-800">
                <p className="text-government-500 text-xs uppercase tracking-widest mb-4 font-bold">
                  {t.status}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-government-300">Fayda OTP/eKYC</span>
                    {isFaydaVerified ? (
                      <span className="text-ethiopia-green flex items-center gap-2 font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Verified
                      </span>
                    ) : (
                      <span className="text-yellow-500 flex items-center gap-2 font-bold">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-government-300">Auto-approval</span>
                    {isAutoApproved ? (
                      <span className="text-ethiopia-green flex items-center gap-2 font-bold">
                        <CheckCircle2 className="w-4 h-4" /> {t.autoApproved}
                      </span>
                    ) : (
                      <span className="text-yellow-500 flex items-center gap-2 font-bold">
                        <Clock className="w-4 h-4" /> {needsManualReview ? t.manualReview : 'Pending'}
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                    <p className="text-xs text-government-500 uppercase font-bold tracking-widest">Current Category</p>
                    <p className="text-lg font-black">{categoryLabel(taxCategoryOnChain)}</p>
                    <p className="text-xs text-government-500 mt-2">
                      Category is fixed after registration for this wallet. Use a new wallet if you need to register as another category.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-government-900/40 p-6 rounded-3xl border border-government-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-government-500 text-xs uppercase tracking-widest font-bold">{t.taxPaid}</p>
                    <p className="text-3xl font-black text-white mt-1">
                      Ξ {ethers.formatEther(taxPaidWei)}
                    </p>
                    <p className="text-xs text-government-500 mt-1">Prototype units</p>
                  </div>
                  <CreditCard className="w-8 h-8 text-government-700" />
                </div>

                {receipts.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs text-government-500 uppercase font-bold tracking-widest mb-3">
                      Recent receipts
                    </p>
                    <div className="space-y-2">
                      {receipts.map((r, idx) => (
                        <div
                          key={`${r.kind}-${r.blockNumber}-${idx}`}
                          className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/5 border border-white/10"
                        >
                          <div className="text-xs text-government-300 font-bold">
                            {r.kind === 'tax' ? 'Tax payment' : 'Payroll withholding'}
                          </div>
                          <div className="text-sm font-black text-white">
                            Ξ {ethers.formatEther(r.amountWei)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-government-900/40 p-7 rounded-3xl border border-government-800">
              <div className="flex items-center gap-3 mb-5">
                <Landmark className="w-6 h-6 text-ethiopia-blue" />
                <h2 className="text-2xl font-bold">
                  {lang === 'en' ? 'Pay your taxes' : 'ታክስዎን ይክፈሉ'}
                </h2>
              </div>

              {isAutoApproved && (taxCategoryOnChain === 2 || taxCategoryOnChain === 3) ? (
                <>
                  <div className="flex items-center justify-between mb-5 p-4 bg-white/5 border border-white/10 rounded-xl">
                    <div>
                      <p className="text-xs text-government-500 uppercase font-bold tracking-widest">{t.due}</p>
                      <p className="text-3xl font-black text-white mt-1">
                        Ξ {ethers.formatEther(dueWei)}
                      </p>
                    </div>
                    <div className="text-xs text-government-500 font-bold text-right">
                      {taxCategoryOnChain === 2 ? (lang === 'en' ? 'Annual (Category B)' : 'ዓመታዊ') : (lang === 'en' ? 'Monthly (Micro)' : 'ወርሃዊ')}
                    </div>
                  </div>

                  <button
                    onClick={payTax}
                    disabled={isProcessing || dueWei <= 0n}
                    className="w-full py-4 bg-ethiopia-blue hover:bg-blue-700 disabled:opacity-50 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
                  >
                    {isProcessing ? 'Processing...' : t.payTax}
                  </button>
                </>
              ) : (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-yellow-200 font-bold">
                  {taxCategoryOnChain === 0
                    ? 'Government employee taxes are deducted automatically from salary.'
                    : taxCategoryOnChain === 1
                    ? 'Category A taxes come from bank deposit integration (citizen direct pay disabled).'
                    : 'Your taxes can be paid once you are auto-approved.'}
                </div>
              )}

              {txMessage && (
                <div className="mt-4 text-sm font-medium bg-white/5 border border-white/10 rounded-xl p-3">
                  {txMessage}
                </div>
              )}

              <div className="mt-4 text-xs text-government-500">
                Balance (wallet): Ξ {balance}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CitizenPortal;

