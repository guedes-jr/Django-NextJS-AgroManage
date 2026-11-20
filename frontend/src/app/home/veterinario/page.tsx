"use client";

import { Suspense } from "react";
import { VeterinaryArea } from "@/components/veterinary/VeterinaryArea";

export default function VeterinaryPage() {
  return (
    <Suspense fallback={null}>
      <VeterinaryArea />
    </Suspense>
  );
}
