import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <div className="eyebrow">404</div>
        <h1 className="my-3 text-4xl">We couldn’t find that page</h1>
        <Link href="/" className="btn">Back to home</Link>
      </div>
    </div>
  );
}
