import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section not-found">
      <div>
        <p className="label">404</p>
        <h1>This page has healed over.</h1>
        <p className="section-intro" style={{ margin: '0 auto 28px' }}>The page you were looking for doesn&apos;t exist or has moved.</p>
        <Link href="/" className="btn btn-sogan">Back to the studio</Link>
      </div>
    </section>
  );
}
