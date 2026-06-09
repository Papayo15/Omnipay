import { redirect } from "next/navigation";

// Ruta obsoleta — toda la UX ahora vive en app/page.tsx (One-Page App)
export default function RemesaPage() {
  redirect("/");
}
