import { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { MapPin, ChevronDown, CheckCircle2, Search, ShieldCheck, FileText, ExternalLink, Loader2 } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (user: any, branch: string) => void;
}

const BRANCHES = ["Mumbai", "National", "Ajmer"];
const PROXY_URL = "https://donationweb-53ed.onrender.com";

export default function Login({ onLoginSuccess }: LoginProps) {
    const [activeTab, setActiveTab] = useState<"login" | "verify">("login");
    const [selectedBranch, setSelectedBranch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Verification State
    const [panNumber, setPanNumber] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [donations, setDonations] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    const handleGoogleLogin = async () => {
        if (!selectedBranch) {
            setError("Please select a branch first");
            return;
        }
        
        setLoading(true);
        setError("");
        
        try {
            const result = await signInWithPopup(auth, googleProvider);
            onLoginSuccess(result.user, selectedBranch);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
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
                    <div className="bg-blue-900 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/20">
                        <span className="text-white font-black text-3xl italic">U</span>
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
                            Manager Login
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
                                <h2 className="text-2xl font-black text-gray-900 mb-8">Management Access</h2>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-[2px] ml-1">Select Branch</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-600" size={20} />
                                            <select 
                                                value={selectedBranch}
                                                onChange={(e) => setSelectedBranch(e.target.value)}
                                                className="w-full bg-gray-50 border-2 border-gray-100 focus:border-blue-500 focus:bg-white rounded-2xl pl-14 pr-12 py-4 outline-none transition-all font-bold text-gray-700 appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled>Choose your branch...</option>
                                                {BRANCHES.map(b => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 text-red-600 px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleGoogleLogin}
                                        disabled={loading}
                                        className={`w-full py-4 rounded-2xl font-black text-white bg-blue-900 hover:bg-blue-800 shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-4 relative overflow-hidden group ${loading ? 'opacity-70 cursor-wait' : ''}`}
                                    >
                                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                        {loading ? (
                                            <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <div className="bg-white p-1 rounded-lg">
                                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                                    </svg>
                                                </div>
                                                Sign in with Google
                                            </>
                                        )}
                                    </button>
                                </div>
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
                                {activeTab === "login" ? "Authorized Personnel Only" : "Public Verification Portal"}<br/>
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

