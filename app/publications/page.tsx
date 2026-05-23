import { redirect } from "next/navigation";

export default function PublicationsRedirect() {
  redirect("/archives");
}
