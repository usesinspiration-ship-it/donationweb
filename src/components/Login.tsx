import { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { MapPin, ChevronDown, CheckCircle2 } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (user: any, branch: string) => void;
}

const BRANCHES = ["Mumbai", "National", "Ajmer"];

export default function Login({ onLoginSuccess }: LoginProps) {
    const [selectedBranch, setSelectedBranch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleGoogleLogin = async () => {
        if (!selectedBranch) {
            setError("Please select a branch first");
            return;
        }
        
        setLoading(true);
        setError("");
        
        try {
            const result = await signInWithPopup(auth, googleProvider);

            // Access control — check against allowlist from env
            const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || "")
                .split(",")
                .map((e: string) => e.trim().toLowerCase())
                .filter(Boolean);

            if (allowedEmails.length > 0 && !allowedEmails.includes(result.user.email?.toLowerCase() || "")) {
                await import('firebase/auth').then(({ signOut }) => signOut(auth));
                setError("Access denied. This account is not authorized.");
                setLoading(false);
                return;
            }

            onLoginSuccess(result.user, selectedBranch);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Login failed. Please try again.");
        } finally {
            setLoading(false);
        }
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
                    <p className="text-gray-500 font-medium tracking-wide">Universal Sadhana for Eternal Seva</p>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl shadow-blue-900/10 p-10 border border-gray-100 relative overflow-hidden">
                    {/* Decorative Background Element */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    
                    <div className="relative z-10">
                        <h2 className="text-2xl font-black text-gray-900 mb-8">Management Access</h2>

                        <div className="space-y-6">
                            {/* Branch Selection */}
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

                            {/* Google Login Button */}
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

                        <div className="mt-10 pt-8 border-t border-gray-50 text-center">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest leading-loose">
                                Authorized Personnel Only<br/>
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
                        <MapPin size={24} className="text-blue-900 mb-2" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">Isolated</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
