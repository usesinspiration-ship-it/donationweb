import React, { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';
import Papa from 'papaparse';
import { 
    Printer, 
    Save, 
    History, 
    PlusCircle, 
    Trash2, 
    Eye, 
    Edit, 
    Loader2,
    Search,
    LogOut,
    User,
    MapPin,
    Upload,
    ChevronLeft,
    SkipForward,
    FileSpreadsheet
} from 'lucide-react';

// ASSETS & FIREBASE
import logoUrl from "./assets/logo/logo.png";
import signatureUrl from "./assets/logo/signature.png";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Login from "./components/Login";

const PROXY_URL = "https://donationweb-53ed.onrender.com";

const BRANCH_PREFIXES: Record<string, string> = {
    "National": "UD/IN/26-27/",
    "Mumbai": "UD/MUM/26-27/",
    "Ajmer": "UD/AJM/26-27/"
};

const convertNumberToWords = (amount: number): string => {
    if (amount === 0 || isNaN(amount)) return "";
    const single = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const double = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const formatTense = (num: number): string => {
        if (num < 10) return single[num];
        else if (num < 20) return double[num - 10];
        else {
            const digit = num % 10;
            if (digit === 0) return tens[Math.floor(num / 10)];
            else return tens[Math.floor(num / 10)] + " " + single[digit];
        }
    };

    let numStr = Math.floor(amount).toString();
    if (numStr.length > 9) return "Amount too large";
    let result = "";
    numStr = ("000000000" + numStr).slice(-9);
    const crores = parseInt(numStr.substring(0, 2));
    const lakhs = parseInt(numStr.substring(2, 4));
    const thousands = parseInt(numStr.substring(4, 6));
    const hundreds = parseInt(numStr.substring(6, 7));
    const remainingTens = parseInt(numStr.substring(7, 9));

    if (crores > 0) result += formatTense(crores) + " Crore ";
    if (lakhs > 0) result += formatTense(lakhs) + " Lakh ";
    if (thousands > 0) result += formatTense(thousands) + " Thousand ";
    if (hundreds > 0) result += formatTense(hundreds) + " Hundred ";
    if (remainingTens > 0) {
        if (result !== "" && hundreds === 0) result += "and ";
        else if (result !== "") result += "and ";
        result += formatTense(remainingTens) + " ";
    }
    return result.trim() + " Only";
};

interface ReceiptRecord {
    id: string;
    receiptNo: string;
    amount: string;
    date: string;
    timestamp: string;
    donorName?: string;
    panNumber?: string;
    city?: string;
    phoneNumber?: string;
    branch?: string;
}

interface ParsedReceipt {
    date: string;
    donorName: string;
    city: string;
    phoneNumber: string;
    amount: string;
    panNumber: string;
    paymentMode: string;
    purpose: string;
}

export default function App() {
    // AUTH STATE
    const [user, setUser] = useState<any>(null);
    const [selectedBranch, setSelectedBranch] = useState<string>(localStorage.getItem("selectedBranch") || "");
    const [isAdmin, setIsAdmin] = useState<boolean>(localStorage.getItem("isAdmin") === "true");
    const [authLoading, setAuthLoading] = useState(true);

    const today = new Date().toISOString().split("T")[0];

    const getInitialReceiptNo = (branch?: string) => {
        const b = branch || selectedBranch;
        if (!b) return "";
        const prefix = BRANCH_PREFIXES[b] || "USES/";
        const saved = localStorage.getItem(`receiptCount_${b}`);
        const count = saved ? parseInt(saved, 10) : 1;
        return `${prefix}${String(count).padStart(3, '0')}`;
    };

    const [formData, setFormData] = useState({
        receiptNo: getInitialReceiptNo(),
        date: today,
        donorName: "ABHAY KUMAR MISHRA",
        panNumber: "ALJPM4419M",
        city: "Mumbai",
        phoneNumber: "9876543210",
        amount: "13000",
        amountWords: "",
        paymentMode: "NEFT",
        purpose: "General Contribution",
        specificPurpose: ""
    });

    const [showConfirm, setShowConfirm] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [view, setView] = useState<"form" | "history" | "bulk_import" | "bulk_review">("form");
    const [records, setRecords] = useState<ReceiptRecord[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<string | null>(null);
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [pendingReceipts, setPendingReceipts] = useState<ParsedReceipt[]>([]);
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
    const [selectedRecordKeys, setSelectedRecordKeys] = useState<Set<string>>(new Set());

    const parseCsvDate = (dateStr: string) => {
        if (!dateStr) return today;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toLowerCase();
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            const month = months[monthStr.substring(0, 3)] || '01';
            return `${year}-${month}-${day}`;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return today;
    };

    const cleanDonorName = (name: string) => {
        if (!name) return "";
        return name.replace(/^Donation Received\s*-\s*/i, "").replace(/^Donation Received\s*/i, "").trim();
    };

    const loadReviewReceipt = (receipt: ParsedReceipt, customReceiptNo?: string) => {
        setFormData(prev => ({
            ...prev,
            receiptNo: customReceiptNo !== undefined ? customReceiptNo : prev.receiptNo,
            date: receipt.date,
            donorName: receipt.donorName,
            city: receipt.city,
            phoneNumber: receipt.phoneNumber,
            amount: receipt.amount,
            panNumber: receipt.panNumber,
            paymentMode: ["NEFT", "Cheque", "Cash", "UPI", "DD"].includes(receipt.paymentMode) ? receipt.paymentMode : "NEFT",
            purpose: ["General Contribution", "Specific Project"].includes(receipt.purpose) ? receipt.purpose : "General Contribution",
            specificPurpose: ""
        }));
    };

    const processCSVData = (data: any[]) => {
        const parsed = data.map(row => {
            const amtRaw = row["Amt"] || row["Amount"] || row["amount"] || "";
            // Clean amount string from commas
            const amount = amtRaw ? amtRaw.toString().replace(/,/g, '').trim() : "";
            
            // Try to figure out payment mode
            let paymentMode = row["Payment mode"] || row["Payment Mode"] || "NEFT";
            if (paymentMode.toLowerCase() === "online") {
                paymentMode = "NEFT"; // Default online to NEFT
            }

            return {
                date: parseCsvDate(row["Date"] || row["date"] || ""),
                donorName: cleanDonorName(row["Name"] || row["name"] || row["Donor Name"] || ""),
                city: row["City"] || row["city"] || "",
                phoneNumber: (row["Phone no"] || row["Phone"] || row["phoneNumber"] || row["Phone Number"] || "").toString().trim(),
                amount: amount,
                panNumber: (row["Pan card"] || row["PAN"] || row["Pan Number"] || row["panNumber"] || "").toString().trim().toUpperCase(),
                paymentMode: paymentMode,
                purpose: row["Purpose"] || "General Contribution"
            };
        }).filter(r => {
            if (!r.donorName && !r.amount) return false;
            if (!selectedBranch) return true;

            const cityValue = (r.city || "").trim().toLowerCase();
            const branchValue = selectedBranch.trim().toLowerCase();

            if (branchValue === "mumbai") {
                return cityValue === "mumbai";
            } else if (branchValue === "ajmer") {
                return cityValue === "ajmer";
            } else if (branchValue === "national") {
                return cityValue === "" || cityValue === "national";
            }
            return true;
        });
        
        if (parsed.length > 0) {
            setPendingReceipts(parsed);
            setCurrentReviewIndex(0);
            loadReviewReceipt(parsed[0]);
            setView("bulk_review");
        } else {
            alert("No valid data found in CSV");
        }
    };

    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                processCSVData(results.data);
            }
        });
        e.target.value = ''; // reset
    };

    const handleUploadAll = async () => {
        if (pendingReceipts.length === 0) return;
        const remainingCount = pendingReceipts.length - currentReviewIndex;
        if (!window.confirm(`Are you sure you want to upload all remaining ${remainingCount} receipts to the cloud automatically? (This will not download PDFs to your computer to prevent browser flooding).`)) return;
        
        setIsUploading(true);
        try {
            let nextNo = formData.receiptNo; // Start with current number
            
            for (let i = currentReviewIndex; i < pendingReceipts.length; i++) {
                const receipt = pendingReceipts[i];
                setCurrentReviewIndex(i);
                
                // Update form state for the current item
                loadReviewReceipt(receipt, nextNo);
                
                // Wait for React to render the DOM
                await new Promise(resolve => setTimeout(resolve, 350));
                
                // Generate PDF Blob
                const blob = await generatePdfBlob();
                if (!blob) {
                    throw new Error(`Failed to generate PDF for ${receipt.donorName}`);
                }
                
                const fileName = `Receipt_${nextNo.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
                
                // Upload to R2 via local proxy (no local download here to avoid flooding)
                const response = await fetch(`${PROXY_URL}/upload?fileName=${fileName}`, {
                    method: 'PUT',
                    body: blob,
                    headers: {
                        'X-Metadata': JSON.stringify({
                            receiptno: nextNo,
                            donorname: receipt.donorName,
                            pannumber: receipt.panNumber,
                            city: receipt.city,
                            phonenumber: receipt.phoneNumber,
                            amount: receipt.amount,
                            paymentmode: ["NEFT", "Cheque", "Cash", "UPI", "DD"].includes(receipt.paymentMode) ? receipt.paymentMode : "NEFT",
                            purpose: ["General Contribution", "Specific Project"].includes(receipt.purpose) ? receipt.purpose : "General Contribution",
                            specificpurpose: "",
                            date: receipt.date,
                            branch: selectedBranch
                        })
                    }
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || `Upload failed for ${receipt.donorName}`);
                }
                
                // Generate next receipt number for next iteration
                if (i < pendingReceipts.length - 1) {
                    nextNo = getNextReceiptNo();
                } else {
                    // Final iteration done, increment one last time for future manual receipts
                    getNextReceiptNo();
                }
            }
            
            confetti({
                particleCount: 200,
                spread: 120,
                origin: { y: 0.6 }
            });
            alert("All receipts saved and uploaded successfully!");
            setPendingReceipts([]);
            setCurrentReviewIndex(0);
            setView("form");
        } catch (error: any) {
            alert("Error during bulk upload: " + error.message);
            incrementReceiptNo();
        } finally {
            setIsUploading(false);
        }
    };

    const toggleSelectRecord = (key: string) => {
        setSelectedRecordKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedRecordKeys.size === filteredRecords.length) {
            setSelectedRecordKeys(new Set());
        } else {
            setSelectedRecordKeys(new Set(filteredRecords.map(r => r.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (!isAdmin) return;
        if (selectedRecordKeys.size === 0) return;
        
        if (!window.confirm(`Are you sure you want to delete the ${selectedRecordKeys.size} selected receipts? This will permanently delete them from both the database and cloud storage.`)) return;
        
        setIsFetching(true);
        try {
            const keysArray = Array.from(selectedRecordKeys);
            let successCount = 0;
            
            for (const key of keysArray) {
                try {
                    const res = await fetch(`${PROXY_URL}/delete?file=${key}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        successCount++;
                    }
                } catch (err) {
                    console.error(`Failed to delete ${key}`, err);
                }
            }
            
            alert(`Successfully deleted ${successCount} of ${keysArray.length} receipts.`);
            setSelectedRecordKeys(new Set());
            fetchR2History();
        } catch (error) {
            alert("Error during bulk delete.");
        } finally {
            setIsFetching(false);
        }
    };

    // MONITOR AUTH
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setAuthLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleLoginSuccess = (u: any, branch: string, adminStatus: boolean) => {
        setUser(u);
        setSelectedBranch(branch);
        setIsAdmin(adminStatus);
        localStorage.setItem("selectedBranch", branch);
        localStorage.setItem("isAdmin", adminStatus.toString());
        setFormData(prev => ({
            ...prev,
            receiptNo: getInitialReceiptNo(branch)
        }));
    };

    const handleLogout = async () => {
        if (window.confirm("Are you sure you want to log out?")) {
            await signOut(auth);
            setSelectedBranch("");
            setIsAdmin(false);
            localStorage.removeItem("selectedBranch");
            localStorage.removeItem("isAdmin");
        }
    };

    const getNextReceiptNo = () => {
        if (!selectedBranch) return "";
        const prefix = BRANCH_PREFIXES[selectedBranch] || "USES/";
        const saved = localStorage.getItem(`receiptCount_${selectedBranch}`);
        const count = saved ? parseInt(saved, 10) : 1;
        const newCount = count + 1;
        localStorage.setItem(`receiptCount_${selectedBranch}`, newCount.toString());
        return `${prefix}${String(newCount).padStart(3, '0')}`;
    };

    const incrementReceiptNo = () => {
        const nextNo = getNextReceiptNo();
        if (nextNo) {
            setFormData(prev => ({
                ...prev,
                receiptNo: nextNo
            }));
        }
    };

    const handleEditCounter = () => {
        if (!selectedBranch) return;
        const prefix = BRANCH_PREFIXES[selectedBranch] || "USES/";
        const currentSaved = localStorage.getItem(`receiptCount_${selectedBranch}`) || "1";
        const newStart = window.prompt(`Enter the new starting receipt number for ${selectedBranch} (e.g., 50 to start from ${prefix}050):`, currentSaved);
        if (newStart !== null) {
            const parsed = parseInt(newStart.trim(), 10);
            if (!isNaN(parsed) && parsed > 0) {
                localStorage.setItem(`receiptCount_${selectedBranch}`, parsed.toString());
                setFormData(prev => ({
                    ...prev,
                    receiptNo: `${prefix}${String(parsed).padStart(3, '0')}`
                }));
            } else {
                alert("Please enter a valid positive number.");
            }
        }
    };

    const fetchR2History = async () => {
        setIsFetching(true);
        try {
            const res = await fetch(`${PROXY_URL}/list`);
            const data = await res.json();
            if (data.success) {
                const mapped: ReceiptRecord[] = data.files.map((f: any) => ({
                    id: f.key,
                    receiptNo: f.metadata?.receiptno || f.key.replace("Receipt_", "").replace(".pdf", "").replace(/_/g, "/"),
                    amount: f.metadata?.amount ? Number(f.metadata.amount).toLocaleString('en-IN') : "---",
                    donorName: f.metadata?.donorname || "---",
                    panNumber: f.metadata?.pannumber || "---",
                    city: f.metadata?.city || "---",
                    phoneNumber: f.metadata?.phonenumber || "---",
                    date: f.metadata?.date || "---",
                    timestamp: f.metadata?.timestamp ? new Date(f.metadata.timestamp).toLocaleString() : "---",
                    branch: f.metadata?.branch || "Unassigned"
                }));
                
                // FILTER BY BRANCH
                const filtered = mapped.filter(r => r.branch === selectedBranch);
                setRecords(filtered);
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (user && selectedBranch) fetchR2History();
    }, [view, user, selectedBranch]);

    useEffect(() => {
        if (formData.amount) {
            const num = parseFloat(formData.amount);
            if (!isNaN(num)) {
                // convertNumberToWords handles whole rupees; paise shown in amount box
                setFormData(prev => ({ ...prev, amountWords: convertNumberToWords(Math.floor(num)) }));
            }
        } else {
            setFormData(prev => ({ ...prev, amountWords: "" }));
        }
    }, [formData.amount]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handlePrint = () => {
        window.print();
        // Only increment after user confirms they actually printed
        if (!isEditing) {
            setTimeout(() => {
                if (window.confirm("Did the receipt print successfully? Click OK to advance to the next receipt number.")) {
                    incrementReceiptNo();
                }
            }, 500);
        }
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    };

    const generatePdfBlob = async (): Promise<Blob | undefined> => {
        const element = document.getElementById('receipt-print-area');
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                ignoreElements: (el) => el.classList.contains('print:hidden')
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.75);
            const pdf = new jsPDF({
                orientation: 'l',
                unit: 'px',
                format: 'a4',
                compress: true
            });

            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const widthRatio = pdfWidth / imgProps.width;
            const heightRatio = pdfHeight / imgProps.height;
            const ratio = Math.min(widthRatio, heightRatio);

            const renderWidth = imgProps.width * ratio;
            const renderHeight = imgProps.height * ratio;

            const xOffset = (pdfWidth - renderWidth) / 2;
            const yOffset = (pdfHeight - renderHeight) / 2;

            pdf.addImage(imgData, 'JPEG', xOffset, yOffset, renderWidth, renderHeight, undefined, 'FAST');
            return pdf.output('blob');
        } catch (error: any) {
            console.error("PDF Generation Error:", error);
            alert("PDF Generation Error: " + error.message);
            return undefined;
        }
    };

    const handleSaveAndUpload = async () => {
        setIsUploading(true);
        try {
            const blob = await generatePdfBlob();
            if (!blob) {
                setIsUploading(false);
                return;
            }

            const fileName = `Receipt_${formData.receiptNo.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

            // 1. Local Download
            saveAs(blob, fileName);

            // 2. Upload to R2 via Local Proxy
            const response = await fetch(`${PROXY_URL}/upload?fileName=${fileName}`, {
                method: 'PUT',
                body: blob,
                headers: {
                    'X-Metadata': JSON.stringify({
                        receiptno: formData.receiptNo,
                        donorname: formData.donorName,
                        pannumber: formData.panNumber,
                        city: formData.city,
                        phonenumber: formData.phoneNumber,
                        amount: formData.amount,
                        paymentmode: formData.paymentMode,
                        purpose: formData.purpose,
                        specificpurpose: formData.specificPurpose,
                        date: formData.date,
                        branch: selectedBranch // INCLUDE BRANCH
                    })
                }
            });

            if (response.ok) {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { y: 0.6 },
                    colors: ['#1e3a8a', '#3b82f6', '#ffffff']
                });
                
                if (view === "bulk_review") {
                    const updatedPending = [...pendingReceipts];
                    updatedPending.splice(currentReviewIndex, 1);
                    
                    if (updatedPending.length > 0) {
                        setPendingReceipts(updatedPending);
                        
                        // Adjust index if we were at the last element
                        let nextIndex = currentReviewIndex;
                        if (nextIndex >= updatedPending.length) {
                            nextIndex = updatedPending.length - 1;
                        }
                        setCurrentReviewIndex(nextIndex);
                        
                        const nextReceiptNo = getNextReceiptNo();
                        loadReviewReceipt(updatedPending[nextIndex], nextReceiptNo);
                    } else {
                        alert("Bulk upload completed successfully!");
                        incrementReceiptNo();
                        setPendingReceipts([]);
                        setCurrentReviewIndex(0);
                        setView("form");
                    }
                } else {
                    if (!isEditing) incrementReceiptNo();
                    setIsEditing(false);
                    alert("Receipt saved and uploaded successfully!");
                }
                setShowConfirm(false);
            } else {
                const err = await response.json();
                throw new Error(err.error || "Upload failed");
            }
        } catch (error: any) {
            alert("Error: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleViewFile = (fileName: string) => {
        window.open(`${PROXY_URL}/download?file=${fileName}`, '_blank');
    };

    const handleEditReceipt = async (fileName: string) => {
        setIsLoadingMetadata(fileName);
        try {
            const res = await fetch(`${PROXY_URL}/metadata?file=${fileName}`);
            const data = await res.json();
            if (data.success) {
                const meta = data.metadata;
                setFormData({
                    receiptNo: meta.receiptno || "",
                    date: meta.date || today,
                    donorName: meta.donorname || "",
                    panNumber: meta.pannumber || "",
                    city: meta.city || "",
                    phoneNumber: meta.phonenumber || "",
                    amount: meta.amount || "",
                    amountWords: "",
                    paymentMode: meta.paymentmode || "NEFT",
                    purpose: meta.purpose || "General Contribution",
                    specificPurpose: meta.specificpurpose || ""
                });
                setIsEditing(true);
                setView("form");
            }
        } catch (err) {
            console.error(err);
            alert("Failed to fetch receipt details.");
        } finally {
            setIsLoadingMetadata(null);
        }
    };

    const handleDeleteReceipt = async (fileName: string, receiptNo: string) => {
        if (!isAdmin) {
            alert("Deletion restricted. Only administrators can delete receipts.");
            return;
        }
        if (!window.confirm(`Are you sure you want to delete receipt ${receiptNo}?`)) return;

        setIsDeletingId(fileName);
        try {
            const res = await fetch(`${PROXY_URL}/delete?file=${fileName}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                fetchR2History();
            } else {
                alert("Error deleting receipt.");
            }
        } catch (err) {
            alert("Error deleting receipt.");
        } finally {
            setIsDeletingId(null);
        }
    };

    const filteredRecords = records.filter(r => 
        r.receiptNo.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.donorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.panNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.phoneNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isValid = formData.receiptNo && formData.donorName && formData.amount;

    if (authLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-blue-900 mb-4" size={48} />
                <p className="font-black text-blue-900 uppercase tracking-widest text-xs">Authenticating...</p>
            </div>
        );
    }

    if (!user || !selectedBranch) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
            {/* NAVIGATION HEADER */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-30 flex justify-between items-center print:hidden shadow-sm">
                <div className="flex items-center gap-3">
                    <img src={logoUrl} alt="Logo" className="h-10 w-auto" />
                    <div>
                        <h1 className="font-bold text-blue-900 text-xl leading-none">USES Foundation</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <MapPin size={10} className="text-blue-600" />
                            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wide">{selectedBranch} Branch</p>
                        </div>
                    </div>
                </div>
                
                <nav className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => {
                            setView("form");
                            // Fix #10: reset editing state when navigating to Create tab manually
                            if (isEditing) {
                                setIsEditing(false);
                                setFormData(prev => ({ ...prev, receiptNo: getInitialReceiptNo(selectedBranch) }));
                            }
                        }}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${view === "form" ? "bg-white text-blue-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                        <PlusCircle size={16} />
                        Create
                    </button>
                    <button 
                        onClick={() => setView("history")}
                        className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${view === "history" ? "bg-white text-blue-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                        <History size={16} />
                        History ({records.length})
                    </button>
                    {isAdmin && (
                        <button 
                            onClick={() => {
                                if (pendingReceipts.length > 0) {
                                    setView("bulk_review");
                                } else {
                                    setView("bulk_import");
                                }
                            }}
                            className={`px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${view === "bulk_import" || view === "bulk_review" ? "bg-white text-blue-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                            <FileSpreadsheet size={16} />
                            {pendingReceipts.length > 0 ? `Bulk Review (${pendingReceipts.length - currentReviewIndex})` : "Bulk Import"}
                        </button>
                    )}
                </nav>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 pr-6 border-r border-gray-200">
                        <div className="text-right">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Manager</p>
                            <p className="text-sm font-bold text-blue-900">{user.displayName || "User"}</p>
                        </div>
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold shadow-sm">
                                <User size={20} />
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg group"
                        title="Logout"
                    >
                        <LogOut size={20} className="group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </header>

            <main className="flex-1">
                {(view === "form" || view === "bulk_review") ? (
                    <div className="flex flex-col xl:flex-row gap-8 p-4 xl:p-8 max-w-[1600px] mx-auto min-h-screen print:bg-white print:p-0">
                        {/* FORM PANEL - RENDERED AS USUAL */}
                        {/* ... but the JSX was actually duplicated, wait let's just make it clear ... */}
                        {/* Wait, I should keep the actual panel contents. I will replace it cleanly in the next chunk, but let's replace the whole main block structure. */}
                        {/* Actually, let's keep the Form layout and structure the switch statement correctly. */}
                        {/* Let's view the exact main tag wrapper again to make sure I target the right block. */}
                        {/* Let's write the bulk_import block. */}
                        {/* I can see that {view === "form" ? ( ... ) : ( ... )} */}
                        {/* I will change the start of this block and the end. */}
                        {/* I will do: */}
                        {/* Start: line 496 `const isValid = formData.receiptNo && formData.donorName && formData.amount; ...` */}
                        {/* Let's get the exact code around the end to make it a neat nested ternary or if block. */}
                        {/* FORM PANEL */}
                        <div className="w-full xl:w-1/3 print:hidden bg-white rounded-2xl shadow-md p-8 border border-gray-100 flex flex-col pt-10 h-fit">
                            {view === "bulk_review" && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex flex-col gap-3 animate-fade-in-down">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-bold text-blue-900">Bulk Review Mode</p>
                                            <p className="text-xs text-blue-700 font-semibold">Receipt {currentReviewIndex + 1} of {pendingReceipts.length}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => {
                                                    if (window.confirm("Are you sure you want to discard this receipt from the bulk queue?")) {
                                                        const updatedPending = [...pendingReceipts];
                                                        updatedPending.splice(currentReviewIndex, 1);
                                                        setPendingReceipts(updatedPending);
                                                        
                                                        if (updatedPending.length === 0) {
                                                            alert("Bulk queue is now empty!");
                                                            setView("form");
                                                            setCurrentReviewIndex(0);
                                                        } else {
                                                            let nextIndex = currentReviewIndex;
                                                            if (nextIndex >= updatedPending.length) {
                                                                nextIndex = updatedPending.length - 1;
                                                            }
                                                            setCurrentReviewIndex(nextIndex);
                                                            loadReviewReceipt(updatedPending[nextIndex]);
                                                        }
                                                    }
                                                }}
                                                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition-all"
                                                title="Discard this receipt from queue"
                                            >
                                                Discard
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (window.confirm("Are you sure you want to exit bulk review? Your progress will be reset.")) {
                                                        setPendingReceipts([]);
                                                        setView("form");
                                                    }
                                                }}
                                                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Exit Bulk
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 w-full">
                                        <button 
                                            onClick={() => {
                                                if (currentReviewIndex > 0) {
                                                    const prev = currentReviewIndex - 1;
                                                    setCurrentReviewIndex(prev);
                                                    loadReviewReceipt(pendingReceipts[prev]);
                                                }
                                            }}
                                            disabled={currentReviewIndex === 0}
                                            className="flex-1 flex justify-center items-center gap-1 py-2 bg-white rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-white text-xs font-bold transition-all"
                                        >
                                            <ChevronLeft size={14} /> Prev
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (currentReviewIndex < pendingReceipts.length - 1) {
                                                    const next = currentReviewIndex + 1;
                                                    setCurrentReviewIndex(next);
                                                    loadReviewReceipt(pendingReceipts[next]);
                                                } else {
                                                    alert("Reached the end of bulk receipts.");
                                                }
                                            }}
                                            disabled={currentReviewIndex === pendingReceipts.length - 1}
                                            className="flex-1 flex justify-center items-center gap-1 py-2 bg-white rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-white text-xs font-bold transition-all"
                                        >
                                            Skip <SkipForward size={14} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleUploadAll}
                                        disabled={isUploading}
                                        className="w-full mt-2 py-2.5 px-4 bg-blue-800 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:hover:bg-blue-800"
                                    >
                                        {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                                        Upload All Remaining ({pendingReceipts.length - currentReviewIndex})
                                    </button>
                                </div>
                            )}

                            <div className="mb-8">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-3xl font-extrabold text-blue-900 tracking-tight">
                                            {view === "bulk_review" ? "Review Receipt" : isEditing ? "Edit Receipt" : "Generate Receipt"}
                                        </h2>
                                        <p className="text-gray-500 font-medium mt-2">Managing records for <span className="text-blue-600 font-bold">{selectedBranch}</span></p>
                                    </div>
                                    {isEditing && (
                                        <button 
                                            onClick={() => {
                                                setIsEditing(false);
                                                setFormData(prev => ({ ...prev, receiptNo: getInitialReceiptNo(selectedBranch) }));
                                            }}
                                            className="text-sm font-bold text-red-600 hover:text-red-800 bg-red-50 px-3 py-1 rounded-lg border border-red-100 transition-all"
                                        >
                                            Cancel Edit
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-sm font-bold text-gray-700">Receipt Number <span className="text-red-500">*</span></label>
                                            {!isEditing && isAdmin && (
                                                <button onClick={handleEditCounter} title="Reset Counter" type="button" className="text-blue-600 hover:text-blue-800 transition">
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            {isEditing && (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Locked</span>
                                            )}
                                            {!isAdmin && (
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Locked</span>
                                            )}
                                        </div>
                                        <input 
                                            type="text" name="receiptNo" value={formData.receiptNo} onChange={handleChange}
                                            placeholder={`e.g., ${BRANCH_PREFIXES[selectedBranch] || "USES/"}028`}
                                            disabled={isEditing || !isAdmin}
                                            className={`w-full border rounded-lg px-4 py-3 outline-none transition uppercase font-semibold ${(isEditing || !isAdmin) ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-600'}`}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Date</label>
                                        <input 
                                            type="date" name="date" value={formData.date} onChange={handleChange}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition font-medium"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Donor Full Name <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" name="donorName" value={formData.donorName} onChange={handleChange}
                                        className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 uppercase outline-none focus:ring-2 focus:ring-blue-600 transition font-semibold"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">City</label>
                                        <input 
                                            type="text" name="city" value={formData.city} onChange={handleChange}
                                            placeholder="e.g. Mumbai"
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition font-medium"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label>
                                        <input 
                                            type="text" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange}
                                            placeholder="e.g. 9876543210"
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Amount (₹) <span className="text-red-500">*</span></label>
                                        <input 
                                            type="number" name="amount" value={formData.amount} onChange={handleChange}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 font-bold text-lg text-gray-900 outline-none focus:ring-2 focus:ring-blue-600 transition"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Donor PAN Number</label>
                                        <input 
                                            type="text" name="panNumber" value={formData.panNumber} onChange={handleChange}
                                            maxLength={10}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 uppercase outline-none focus:ring-2 focus:ring-blue-600 transition font-semibold"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Amount in Words</label>
                                    <textarea 
                                        name="amountWords" value={formData.amountWords} onChange={handleChange}
                                        rows={2}
                                        className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-600 transition"
                                    ></textarea>
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Payment Mode</label>
                                        <select 
                                            name="paymentMode" value={formData.paymentMode} onChange={handleChange}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition font-medium"
                                        >
                                            <option value="NEFT">NEFT</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            <option value="DD">DD</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Purpose</label>
                                        <select 
                                            name="purpose" value={formData.purpose} onChange={handleChange}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition font-medium"
                                        >
                                            <option value="General Contribution">General Contribution</option>
                                            <option value="Specific Project">Specific Project</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.purpose === "Specific Project" && (
                                    <div className="animate-fade-in-down">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Specific Project</label>
                                        <input 
                                            type="text" name="specificPurpose" value={formData.specificPurpose} onChange={handleChange}
                                            className="w-full border border-gray-300 bg-gray-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 transition"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
                                <button 
                                    onClick={handlePrint}
                                    disabled={!isValid}
                                    className={`flex-1 flex justify-center items-center gap-2 py-4 px-4 rounded-xl font-bold text-blue-900 border-2 transition-all ${isValid ? 'border-blue-800 hover:bg-blue-50 bg-white active:scale-95' : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'}`}
                                >
                                    <Printer size={20} /> Print
                                </button>
                                <button 
                                    onClick={() => setShowConfirm(true)}
                                    disabled={!isValid || isUploading}
                                    className={`flex-1 flex justify-center items-center gap-2 py-4 px-4 rounded-xl font-bold text-white transition-all shadow-md ${isValid ? 'bg-blue-800 hover:bg-blue-900 active:scale-95' : 'bg-gray-300 cursor-not-allowed shadow-none'}`}
                                >
                                    {isUploading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                    Save & Upload
                                </button>
                            </div>
                        </div>

                        {/* RECEIPT PREVIEW PANEL */}
                        <div className="w-full xl:w-2/3 flex justify-center items-start overflow-auto pb-20">
                            <div id="receipt-print-area" className="bg-white w-[950px] min-w-[950px] print:shadow-none text-black p-12 relative font-sans" style={{ background: '#ffffff', color: '#000000' }}>
                                
                                {/* Header: Logo, Address, Donation Receipt Box */}
                                <div className="flex justify-between items-start mb-4">
                                    {/* Logo */}
                                    <div className="w-[120px] h-[120px] flex items-center justify-center">
                                        <img src={logoUrl} alt="USES Foundation Logo" className="max-w-full max-h-full object-contain" />
                                    </div>

                                    {/* Center Text */}
                                    <div className="flex-1 text-center px-4">
                                        <h1 className="text-[34px] font-bold leading-tight font-sans" style={{ color: '#11057B' }}>USES Foundation</h1>
                                        <p className="text-[19px] font-bold mb-2 font-serif" style={{ color: '#11057B' }}>Universal Sadhana for Eternal Seva</p>
                                        
                                        {selectedBranch === "Ajmer" ? (
                                            <>
                                                <p className="text-[15px]" style={{ color: '#11057B' }}>G Block - 15, Near Vardhaman Dairy, Vaishali Nagar, Ajmer - 305001</p>
                                                <p className="text-[13px]" style={{ color: '#11057B' }}>Ho: A-103, Sai Prasad Building, Near MIDC Metro, Behind Jumboking, Kondivita, Andheri East, Mumbai, Maharashtra - 400093</p>
                                            </>
                                        ) : (
                                            <p className="text-[14px]" style={{ color: '#11057B' }}>Ho: A-103, Sai Prasad Building, Near MIDC Metro, Behind Jumboking, Kondivita, Andheri East, Mumbai, Maharashtra - 400093</p>
                                        )}
                                        <p className="text-[15px]" style={{ color: '#11057B' }}>www.usesfoundation.org</p>
                                        <p className="text-[15px] font-bold mt-1 tracking-wide" style={{ color: '#11057B' }}>Regd No: U85300MH2022NPL376368, PAN: AADCU0252E</p>
                                    </div>

                                    {/* DONATION RECEIPT Box */}
                                    <div className="w-[160px] h-auto min-h-[80px] rounded text-white flex flex-col justify-center items-center p-2 mb-4 mt-2" style={{ background: '#11057B' }}>
                                        <span className="text-lg font-semibold tracking-wider">DONATION</span>
                                        <span className="text-lg font-semibold tracking-wider">RECEIPT</span>
                                        {selectedBranch && selectedBranch !== "National" && (
                                            <div className="mt-1 pt-1 border-t w-4/5 text-center" style={{ borderTopColor: 'rgba(255, 255, 255, 0.2)' }}>
                                                <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{selectedBranch}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Borders and Contact Row */}
                                <div className="pt-2 pb-2 mt-2" style={{ borderTop: '1.5px solid #11057B' }}>
                                    <div className="flex justify-between items-center text-[15px]" style={{ color: '#11057B' }}>
                                        <p className="tracking-wide">Phone: 8108628383, 91237 28383</p>
                                        <p className="tracking-wide">Email: mail@usesfoundation.org</p>
                                    </div>
                                </div>
                                <div className="mb-8" style={{ borderTop: '1.5px solid #11057B' }}></div>

                                {/* Receipt No and Date */}
                                <div className="flex justify-between items-center font-bold text-[17px] mb-8" style={{ color: '#11057B' }}>
                                    <p>Receipt No: <span className="ml-4 font-normal px-2 tracking-wider underline decoration-dotted underline-offset-[6px]" style={{ color: '#1e3a8a' }}>{formData.receiptNo || `${BRANCH_PREFIXES[selectedBranch] || "USES/"}028`}</span></p>
                                    <p>Date: <span className="ml-4 font-normal px-2 underline decoration-dotted underline-offset-[6px]" style={{ color: '#1e3a8a' }}>{formData.date || "2024-09-02"}</span></p>
                                </div>

                                {/* Body Text */}
                                <div className="text-[19px] leading-[2.5] text-justify font-normal mb-12" style={{ color: '#11057B' }}>
                                    Received with thanks from <span className="font-semibold px-2 uppercase underline decoration-dotted decoration-2 underline-offset-[6px]" style={{ color: '#1e40af' }}>{formData.donorName ? `${formData.donorName}${formData.panNumber ? ', PAN: ' + formData.panNumber : ''}` : "ABHAY KUMAR MISHRA, PAN: ALJPM4419M"}</span> the sum of INR <span className="font-semibold px-2 capitalize underline decoration-dotted decoration-2 underline-offset-[6px]" style={{ color: '#1e40af' }}>{formData.amountWords ? `${formData.amountWords}` : "Thirteen thousand Only"}</span> by <span className="font-semibold px-2 uppercase underline decoration-dotted decoration-2 underline-offset-[6px]" style={{ color: '#1e40af' }}>{formData.paymentMode || "NEFT"}</span> for the <span className="font-semibold px-2 capitalize underline decoration-dotted decoration-2 underline-offset-[6px]" style={{ color: '#1e40af' }}>{formData.purpose === "Specific Project" ? formData.specificPurpose || "General Contribution" : formData.purpose}</span>.
                                </div>

                                {/* Amount Box and Signatures Row */}
                                <div className="flex justify-between items-start mb-6">
                                    {/* Amount Box */}
                                    <div className="flex items-center">
                                        <div className="w-[45px] h-[55px] flex justify-center items-center text-white text-2xl font-bold" style={{ background: '#11057B' }}>
                                            ₹
                                        </div>
                                        <div className="h-[55px] flex items-center px-4 min-w-[200px]" style={{ border: '2px dotted #11057B' }}>
                                            <span className="font-bold text-2xl tracking-wider" style={{ color: '#11057B' }}>{formData.amount ? Number(formData.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : "13,000.00"}</span>
                                        </div>
                                    </div>

                                    {/* Received By */}
                                    <div className="text-center flex flex-col items-center pt-2" style={{ color: '#11057B' }}>
                                        <p className="text-[15px] mb-1">Received By,</p>
                                        <p className="font-bold text-[17px] mb-1">For, USES Foundation</p>
                                        <img src={signatureUrl} alt="Signature" className="h-16 object-contain my-1" style={{ mixBlendMode: 'multiply', filter: 'contrast(1.1) brightness(1.1)' }} />
                                        <p className="font-bold text-[17px] leading-tight">Archana Tiwari</p>
                                        <p className="text-[15px] leading-tight">Treasurer</p>
                                    </div>
                                </div>

                                {/* Note and Sanskrit */}
                                <div className=" -mt-16 w-3/5" style={{ color: '#11057B' }}>
                                    <p className="text-[12.5px] text-justify leading-snug">
                                        Note: Contribution to USES Foundation is eligible for deduction from <br/>
                                        Taxable Income under the provisions of Section 80G of Income Tax Act, <br/>
                                        1961. Certificate number: AADCU0252E24MB02 dated 27-11-2024
                                    </p>
                                    <p className="mt-4 text-[22px] font-medium tracking-wider" style={{ color: '#2563eb' }}>
                                        ।। Seva Dharma: Parmo Dharma ।।
                                    </p>
                                </div>

                            </div>
                        </div>

                        {/* CONFIRMATION MODAL */}
                        {showConfirm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 transition-opacity print:hidden">
                                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-down">
                                    <div className="bg-blue-900 px-6 py-4 text-white">
                                        <h3 className="text-xl font-bold">Confirm Receipt Details</h3>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <p className="text-gray-600 text-sm">Please verify the details below before saving and uploading.</p>
                                        
                                        <div className="bg-gray-50 p-4 rounded-lg space-y-2 border border-gray-100">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium text-sm">Receipt No:</span>
                                                <span className="font-bold text-gray-900">{formData.receiptNo}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium text-sm">Donor:</span>
                                                <span className="font-bold text-gray-900">{formData.donorName}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium text-sm">Amount:</span>
                                                <span className="font-bold text-green-700">₹ {Number(formData.amount).toLocaleString('en-IN')}</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 pt-4">
                                            <button
                                                onClick={() => setShowConfirm(false)}
                                                disabled={isUploading}
                                                className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveAndUpload}
                                                disabled={isUploading}
                                                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex justify-center items-center disabled:opacity-70"
                                            >
                                                {isUploading ? <Loader2 className="animate-spin" /> : "Confirm & Save"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : view === "bulk_import" ? (
                    <div className="flex flex-col p-8 max-w-4xl mx-auto min-h-screen">
                        <div className="bg-white rounded-2xl shadow-md p-8 border border-gray-100">
                            <h2 className="text-3xl font-extrabold text-blue-900 tracking-tight mb-4 flex items-center gap-2">
                                <FileSpreadsheet className="text-blue-600" size={32} /> Bulk Import Receipts
                            </h2>
                            <p className="text-gray-500 mb-8">Upload a CSV file to automatically generate a queue of receipts. You can review them one by one, edit if needed, and confirm before saving.</p>
                            
                            <div className="flex flex-col gap-6">
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 transition-colors bg-gray-50 relative group">
                                    <Upload size={48} className="mx-auto text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                                    <p className="text-lg font-bold text-gray-700 mb-2">Upload CSV File</p>
                                    <p className="text-sm text-gray-500 mb-6">Click the button below to select your CSV file.</p>
                                    <input 
                                        type="file" 
                                        accept=".csv" 
                                        onChange={handleCSVUpload}
                                        className="hidden" 
                                        id="csv-upload"
                                    />
                                    <label htmlFor="csv-upload" className="bg-blue-800 hover:bg-blue-900 text-white px-6 py-3 rounded-lg font-bold cursor-pointer transition-colors inline-flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all">
                                        <Upload size={18} /> Select File
                                    </label>
                                </div>
                                
                                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                                    <h3 className="font-bold text-blue-900 mb-2">CSV Column Configuration</h3>
                                    <p className="text-sm text-blue-800 mb-4">Ensure your CSV contains the following column headers exactly:</p>
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {["Date", "Name", "Pan card", "Phone no", "Payment mode", "City", "Amt"].map(h => (
                                            <span key={h} className="bg-white px-3 py-1.5 rounded-md text-xs font-bold text-blue-900 border border-blue-200 shadow-sm">{h}</span>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const csvData = "Sr no,Date,Name,Pan card,Phone no,Payment mode,City,Amt\n1,01-Apr-26,Nishant Kumar Jaiswal,AGBPJ4914D,93046 22622,Online,Mumbai,1000.00\n2,12-Apr-26,Bhagwati Pathak,BAWPP4118H,94213 40799,Online,Mumbai,2000.00";
                                            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'Donation_list_template.csv';
                                            a.click();
                                        }}
                                        className="text-sm font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                                    >
                                        Download Example / Template CSV
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 max-w-[1800px] mx-auto w-full">
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white">
                                <div>
                                    <h2 className="text-2xl font-extrabold text-blue-900">Receipt History ({selectedBranch})</h2>
                                    <p className="text-gray-500 font-medium mt-1">Cloud synchronized historical records</p>
                                </div>
                                <div className="flex gap-4 items-center">
                                    {isAdmin && selectedRecordKeys.size > 0 && (
                                        <button
                                            onClick={handleBulkDelete}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-95 animate-fade-in-down"
                                        >
                                            <Trash2 size={16} /> Delete Selected ({selectedRecordKeys.size})
                                        </button>
                                    )}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input 
                                            type="text" 
                                            placeholder="Search receipts..." 
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 transition"
                                        />
                                    </div>
                                    <span className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold border border-blue-100">
                                        Total: {records.length}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            {isAdmin && (
                                                <th className="px-6 py-4 w-12 text-left">
                                                    <input 
                                                        type="checkbox"
                                                        checked={filteredRecords.length > 0 && selectedRecordKeys.size === filteredRecords.length}
                                                        onChange={toggleSelectAll}
                                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </th>
                                            )}
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">Receipt No</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">Donor Name</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">City</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">Phone Number</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">PAN Number</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">Amount</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider">Date & Time</th>
                                            <th className="px-6 py-4 font-bold text-gray-700 text-[11px] uppercase tracking-wider text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {isFetching ? (
                                            <tr>
                                                <td colSpan={8} className="px-8 py-20 text-center text-blue-600 font-bold">
                                                    <div className="flex flex-col items-center">
                                                        <Loader2 className="animate-spin mb-4" size={32} />
                                                        Syncing with Cloud...
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filteredRecords.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-8 py-20 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <div className="bg-gray-50 p-6 rounded-full mb-4">
                                                            <Search className="w-12 h-12 text-gray-300" />
                                                        </div>
                                                        <p className="text-gray-400 font-medium">No records found for {selectedBranch}.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredRecords.map((record) => (
                                                <tr key={record.id} className={`hover:bg-gray-50 transition-colors group ${selectedRecordKeys.has(record.id) ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''}`}>
                                                    {isAdmin && (
                                                        <td className="px-6 py-4">
                                                            <input 
                                                                type="checkbox"
                                                                checked={selectedRecordKeys.has(record.id)}
                                                                onChange={() => toggleSelectRecord(record.id)}
                                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-blue-900 uppercase tracking-wide text-xs">{record.receiptNo}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-gray-900 uppercase text-xs">{record.donorName}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-gray-600 uppercase">{record.city}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-gray-600">{record.phoneNumber}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-2 py-1 rounded uppercase tracking-wider border border-blue-100">{record.panNumber}</span>
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-gray-900 text-sm italic">₹ {record.amount}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-gray-700">{record.date}</span>
                                                            <span className="text-[9px] text-gray-400 font-medium uppercase">{record.timestamp}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => handleViewFile(record.id)}
                                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                title="View Receipt"
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleEditReceipt(record.id)}
                                                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                                title="Edit Metadata"
                                                                disabled={isLoadingMetadata === record.id}
                                                            >
                                                                {isLoadingMetadata === record.id ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
                                                            </button>
                                                            {isAdmin && (
                                                                <button 
                                                                    onClick={() => handleDeleteReceipt(record.id, record.receiptNo)}
                                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Delete Receipt"
                                                                    disabled={isDeletingId === record.id}
                                                                >
                                                                    {isDeletingId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
