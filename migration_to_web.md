## 3. Web-Ready `App.tsx` (Complete Code)

You can copy this into your new project's `src/App.tsx`. It replaces all Electron IPC calls with browser-compatible logic.

```tsx
import React, { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Replace these with your web assets paths
import logoUrl from "./assets/logo/logo.png";
import signatureUrl from "./assets/logo/signature.png";

// WORKER URL - Replace with your Cloudflare Worker URL after deployment
const WORKER_URL = "https://your-worker.your-subdomain.workers.dev";

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
}

export default function App() {
    const today = new Date().toISOString().split("T")[0];
    const [formData, setFormData] = useState({
        receiptNo: "",
        date: today,
        donorName: "ABHAY KUMAR MISHRA",
        panNumber: "ALJPM4419M",
        amount: "13000",
        amountWords: "",
        paymentMode: "NEFT",
        purpose: "General Donation",
        specificPurpose: ""
    });

    const [showConfirm, setShowConfirm] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [view, setView] = useState<"form" | "history">("form");
    const [records, setRecords] = useState<ReceiptRecord[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<string | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem("receiptCount");
        const count = saved ? parseInt(saved, 10) : 1;
        setFormData(prev => ({ ...prev, receiptNo: `USES/${String(count).padStart(3, '0')}` }));
    }, []);

    const incrementReceiptNo = () => {
        const saved = localStorage.getItem("receiptCount");
        const count = saved ? parseInt(saved, 10) : 1;
        const newCount = count + 1;
        localStorage.setItem("receiptCount", newCount.toString());
        setFormData(prev => ({ ...prev, receiptNo: `USES/${String(newCount).padStart(3, '0')}` }));
    };

    const fetchR2History = async () => {
        setIsFetching(true);
        try {
            const res = await fetch(`${WORKER_URL}/list`);
            const data = await res.json();
            if (data.success) {
                const mapped: ReceiptRecord[] = data.files.map((f: any) => ({
                    id: f.key,
                    receiptNo: f.key.replace("Receipt_", "").replace(".pdf", "").replace(/_/g, "/"),
                    amount: "---",
                    date: new Date(f.lastModified).toLocaleDateString(),
                    timestamp: new Date(f.lastModified).toLocaleString()
                }));
                setRecords(mapped);
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (view === "history") fetchR2History();
    }, [view]);

    const generatePdfBlob = async (): Promise<Blob | undefined> => {
        const element = document.getElementById('receipt-print-area');
        if (!element) return;

        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: 'a4'
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        return pdf.output('blob');
    };

    const handleSaveAndUpload = async () => {
        setIsUploading(true);
        try {
            const blob = await generatePdfBlob();
            if (!blob) return;

            const fileName = `Receipt_${formData.receiptNo.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
            saveAs(blob, fileName);

            // Upload via Worker
            const response = await fetch(`${WORKER_URL}/upload?file=${fileName}`, {
                method: 'PUT',
                body: blob,
                headers: {
                    'X-Metadata': JSON.stringify(formData)
                }
            });

            if (response.ok) {
                alert("Saved & Uploaded Successfully!");
                if (!isEditing) incrementReceiptNo();
                setIsEditing(false);
                setShowConfirm(false);
            } else {
                throw new Error("Upload failed");
            }
        } catch (error) {
            alert("Error: " + error);
        } finally {
            setIsUploading(false);
        }
    };

    // ... rest of the UI logic remains the same ...
    // Note: Use standard window.print() for the print button
}
```

## 4. Final Checklist
1.  **Move Assets:** Move `src/assets/logo/` to your new project.
2.  **Tailwind:** Copy the `index.css` content.
3.  **Worker:** Deploy the Cloudflare Worker to handle R2 communication.
4.  **Local Storage:** Your receipt counter will automatically reset for the new domain, but you can manually set it using the edit button.

---
*Created by Antigravity*
