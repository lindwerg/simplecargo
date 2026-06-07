import { redirect } from "next/navigation";

// Pipeline-home routing (ADR-D12): `/` lands on the unified deals surface. Anonymous
// hits bounce through the middleware/(app) guard to /login; signed-in operators land
// on Сделки.
export default function Home() {
  redirect("/deals");
}
