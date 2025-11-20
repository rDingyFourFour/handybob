// app/customers/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";

async function createCustomer(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!name) throw new Error("Name is required");

  const { error } = await supabase.from("customers").insert({
    user_id: user.id,
    name,
    email,
    phone,
  });

  if (error) throw new Error(error.message);

  redirect("/customers");
}

export default async function NewCustomerPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1>New customer</h1>
        <p className="hb-muted">Add a new customer to your list.</p>
      </div>

      <form action={createCustomer} className="hb-card space-y-4">
        <div>
          <label className="hb-label" htmlFor="name">Name *</label>
          <input id="name" name="name" className="hb-input" required />
        </div>

        <div>
          <label className="hb-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="hb-input" />
        </div>

        <div>
          <label className="hb-label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="hb-input" />
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/customers" className="hb-button-ghost">Cancel</Link>
          <button className="hb-button">Save customer</button>
        </div>
      </form>
    </div>
  );
}
