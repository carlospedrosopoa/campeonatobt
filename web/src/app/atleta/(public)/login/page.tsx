import { redirect } from "next/navigation";
import { getAppAtletaUrl } from "@/lib/app-atleta-url";

export default function AtletaLoginPage() {
  redirect(getAppAtletaUrl());
}

