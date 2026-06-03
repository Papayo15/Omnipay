"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import UniversalForm from "@/components/UniversalForm";

export default function EnviarPage() {
  const router = useRouter();

  return (
    <main className="flex flex-col min-h-screen bg-[#0f172a] px-5 pt-10 pb-10">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-slate-800 transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-6 h-6 text-slate-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Formulario Universal</h1>
          <p className="text-slate-500 text-xs mt-0.5">Paga o cobra desde un solo lugar</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <UniversalForm />
      </motion.div>
    </main>
  );
}
