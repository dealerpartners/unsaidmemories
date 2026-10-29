import './globals.css';
export const metadata = { title: 'UnSaid Memories — Celebrate. Preserve. Remember.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><header><a href="/">UnSaid Memories</a> <a href="/shop">Shop</a> <a href="/admin">Admin</a></header><main>{children}</main></body></html>);
}
