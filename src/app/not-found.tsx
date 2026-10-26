import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 py-6">
      <h2 className="text-3xl font-extrabold">Page not found</h2>
      <Link href="/" className="font-bold text-primary underline-offset-4 hover:underline">
        Back to the menu
      </Link>
    </section>
  );
}
