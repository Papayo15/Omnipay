"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

interface Props {
  transactionType?: "remesa" | "terminal" | "importacion" | null;
}

export default function ProcessingMessages({ transactionType }: Props) {
  const t = useTranslations("processing_msgs");
  const [idx, setIdx] = useState(0);

  const messages: string[] =
    transactionType === "remesa" ? t.raw("transfer") as string[] :
    transactionType === "terminal" ? t.raw("terminal") as string[] :
    t.raw("generic") as string[];

  useEffect(() => {
    setIdx(0);
    const timer = setInterval(() => {
      setIdx((i) => (i < messages.length - 1 ? i + 1 : i));
    }, 1800);
    return () => clearInterval(timer);
  }, [transactionType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-6 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${transactionType}-${idx}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-slate-400 text-sm text-center"
        >
          {messages[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
