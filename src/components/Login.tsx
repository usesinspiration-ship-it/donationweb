import { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { MapPin, ChevronDown, CheckCircle2, Search, ShieldCheck, FileText, ExternalLink, Loader2, User, Lock } from 'lucide-react';

import logoUrl from '../assets/logo/logo.png';

interface LoginProps {
    onLoginSuccess: (user: any, branch: string, isAdmin: boolean) => void;
}

const BRANCHES = ["Mumbai", "National", "Ajmer"];
const PROXY_URL = "https://donationweb-53ed.onrender.com";

export default function Login({ onLoginSuccess }: LoginProps) {
    const [activeTab, setActiveTab] = useState<"login" | "verify">("login");
    const [selectedBranch, setSelectedBranch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Login State
    const [userId, setUserId] = useState("");
    const [password, setPassword] = useState("");
    const [authenticatedUser, setAuthenticatedUser] = useState<any>(null);
    const [availableBranches, setAvailableBranches] = useState<string[]>([]);

    // Verification State
    const [panNumber, setPanNumber] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [donations, setDonations] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !password) {
            setError("Please enter both User ID and Password");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const normalizedId = userId.toLowerCase().trim();
            const email = normalizedId.includes('@') ? normalizedId : `${normalizedId}@uses.com`;
            const result = await signInWithEmailAndPassword(auth, email, password);

            // Determine Authorized Branches
            const userPrefix = normalizedId.split('@')[0];
            let authorized: string[] = [];

            const isAdmin = userPrefix === 'admin';
            if (isAdmin) {
                authorized = BRANCHES;
            } else {
                // Check if user ID matches a branch name
                const matchedBranch = BRANCHES.find(b => b.toLowerCase() === userPrefix);
                if (matchedBranch) {
                    authorized = [matchedBranch];
                } else {
                    // Default to no branches if no match found for security
                    throw new Error("User not assigned to any branch. Contact Admin.");
                }
            }

            if (authorized.length === 1) {
                // Auto-select and finish
                onLoginSuccess(result.user, authorized[0], isAdmin);
            } else {
                // Show branch selection
                setAuthenticatedUser(result.user);
                setAvailableBranches(authorized);
            }
        } catch (err: any) {
            console.error(err);
            if (err.message === "User not assigned to any branch. Contact Admin.") {
                setError(err.message);
            } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError("Invalid User ID or Password");
            } else {
                setError("Login failed. Please contact administrator.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBranchConfirm = () => {
        if (!selectedBranch) {
            setError("Please select a branch to continue");
            return;
        }
        const userPrefix = (authenticatedUser.email || "").split('@')[0];
        const isAdmin = userPrefix === 'admin';
        onLoginSuccess(authenticatedUser, selectedBranch, isAdmin);
    };

    const handleVerifyPan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!panNumber || panNumber.length < 10) {
            setError("Please enter a valid 10-digit PAN number");
            return;
        }

        setVerifying(true);
        setError("");
        setHasSearched(true);
        try {
            const res = await fetch(`${PROXY_URL}/verify-pan?pan=${panNumber}`);
            const data = await res.json();
            if (data.success) {
                setDonations(data.donations);
            } else {
                setError(data.error || "Verification failed");
            }
        } catch (err) {
            console.error(err);
            setError("Failed to fetch donation history");
        } finally {
            setVerifying(false);
        }
    };

    const handleViewDonation = (key: string) => {
        window.open(`${PROXY_URL}/download?file=${key}`, '_blank');
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Brand Logo & Name */}
                <div className="text-center mb-10">
                    <div className="w-32 h-32 flex items-center justify-center mx-auto mb-6">
                        <img src={logoUrl} alt="USES Foundation Logo" className="max-w-full max-h-full object-contain" />
                    </div>
                    <h1 className="text-4xl font-black text-blue-900 tracking-tight mb-2">USES Foundation</h1>
                    <p className="text-gray-500 font-medium tracking-wide text-sm">Universal Sadhana for Eternal Seva</p>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-900/10 border border-gray-100 relative overflow-hidden flex flex-col">
                    {/* Decorative Background Element */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50"></div>

                    {/* Tabs */}
                    <div className="flex p-2 gap-2 bg-gray-50/50 border-b border-gray-100 relative z-10">
                        <button
                            onClick={() => { setActiveTab("login"); setError(""); }}
                            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === "login" ? "bg-white text-blue-900 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            Member Login
                        </button>
                        <button
                            onClick={() => { setActiveTab("verify"); setError(""); }}
                            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === "verify" ? "bg-white text-blue-900 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                        >
                            Donor Verify
                        </button>
                    </div>

                    <div className="p-10 relative z-10">
                        {activeTab === "login" ? (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <h2 className="text-2xl font-black text-gray-900 mb-8">
                                    {authenticatedUser ? "Select Working Branch" : "Management Access"}
                                </h2>

                                {!authenticatedUser ? (
                                    <form onSubmit={handleEmailLogin} className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[2px] ml-1">User ID</label>
                                            <div className="relative">
                                                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                                                <input
                                                    type="text"
                                                    value={userId}
                                                    onChange={(e) => setUserId(e.target.value)}
                                                    placeholder="Enter User ID"
                                                    className="w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl pl-14 pr-12 py-4 outline-none transition-all font-bold text-gray-700"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[2px] ml-1">Password</label>
                                            <div className="relative">
                                                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                                                <input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl pl-14 pr-12 py-4 outline-none transition-all font-bold text-gray-700"
                                                />
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="bg-red-50 text-red-600 px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                                                <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className={`w-full py-4 rounded-2xl font-black text-white bg-blue-900 hover:bg-blue-800 shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-4 relative overflow-hidden group ${loading ? 'opacity-70 cursor-wait' : ''}`}
                                        >
                                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                            {loading ? (
                                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            ) : (
                                                "Access Dashboard"
                                            )}
                                        </button>
                                    </form>
                                ) : (
                                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-3">
                                            <div className="bg-blue-600 p-2 rounded-lg text-white">
                                                <ShieldCheck size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Authenticated as</p>
                                                <p className="text-sm font-bold text-blue-900">{userId.toLowerCase()}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[2px] ml-1">Select Branch</label>
                                            <div className="relative">
                                                <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                                                <select
                                                    value={selectedBranch}
                                                    onChange={(e) => setSelectedBranch(e.target.value)}
                                                    className="w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl pl-14 pr-12 py-4 outline-none transition-all font-bold text-gray-700 appearance-none cursor-pointer"
                                                >
                                                    <option value="" disabled>Choose branch...</option>
                                                    {availableBranches.map(b => (
                                                        <option key={b} value={b}>{b}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                                            </div>
                                        </div>

                                        {error && (
                                            <div className="bg-red-50 text-red-600 px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-3">
                                                <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            onClick={handleBranchConfirm}
                                            className="w-full py-4 rounded-2xl font-black text-white bg-blue-900 hover:bg-blue-800 shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                                        >
                                            Continue to Dashboard
                                        </button>

                                        <button
                                            onClick={() => { setAuthenticatedUser(null); setError(""); }}
                                            className="w-full text-[10px] font-black text-gray-400 uppercase tracking-[2px] hover:text-gray-600 transition-colors"
                                        >
                                            ← Use different account
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <h2 className="text-2xl font-black text-gray-900 mb-2">Check Authenticity</h2>
                                <p className="text-gray-500 text-sm mb-8 font-medium">Enter your PAN to view your donations</p>

                                <form onSubmit={handleVerifyPan} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-[2px] ml-1">PAN Number</label>
                                        <div className="relative">
                                            <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                                            <input
                                                type="text"
                                                value={panNumber}
                                                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                                                placeholder="ABCDE1234F"
                                                maxLength={10}
                                                className="w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl pl-14 pr-12 py-4 outline-none transition-all font-bold text-gray-700 uppercase"
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 text-red-600 px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-3">
                                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={verifying}
                                        className={`w-full py-4 rounded-2xl font-black text-white bg-blue-900 hover:bg-blue-800 shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-4 ${verifying ? 'opacity-70' : ''}`}
                                    >
                                        {verifying ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                                        Verify Donation
                                    </button>
                                </form>

                                {hasSearched && !verifying && (
                                    <div className="mt-8 space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {donations.length > 0 ? (
                                            donations.map((donation, idx) => (
                                                <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 hover:border-blue-200 transition-colors group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{donation.receiptNo}</p>
                                                            <p className="font-bold text-gray-900">{donation.donorName}</p>
                                                        </div>
                                                        <p className="font-black text-blue-900">₹{Number(donation.amount).toLocaleString('en-IN')}</p>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200/50">
                                                        <div className="flex items-center gap-2">
                                                            <FileText size={14} className="text-gray-400" />
                                                            <span className="text-[11px] font-bold text-gray-500">{donation.date}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleViewDonation(donation.key)}
                                                            className="flex items-center gap-1 text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                                                        >
                                                            View Receipt <ExternalLink size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-10 bg-gray-50 rounded-[30px] border-2 border-dashed border-gray-200">
                                                <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                                    <Search size={20} className="text-gray-300" />
                                                </div>
                                                <p className="text-gray-400 font-bold text-sm uppercase tracking-widest">No donations found</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-10 pt-8 border-t border-gray-50 text-center">
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-loose">
                                {activeTab === "login" ? "Authorized Personnel Only" : "Public Verification Portal"}<br />
                                <span className="opacity-50">© {new Date().getFullYear()} USES Foundation</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-center gap-10">
                    <div className="flex flex-col items-center opacity-40">
                        <CheckCircle2 size={24} className="text-blue-900 mb-2" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">Secure</span>
                    </div>
                    <div className="flex flex-col items-center opacity-40">
                        <ShieldCheck size={24} className="text-blue-900 mb-2" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">Verified</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

