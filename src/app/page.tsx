import { redirect } from "next/navigation";

// Pipeline-home routing (ADR-D12): `/` lands on the funnel's first stage. Anonymous
// hits bounce through the middleware/(app) guard to /login; signed-in operators land
// on Запросы.
export default function Home() {
  redirect("/requests");
}
