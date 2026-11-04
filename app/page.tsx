import TripApp from './TripApp';
import AccessGate from './components/AccessGate';
export const dynamic = 'force-dynamic';
export default async function Home() {
  return <AccessGate><TripApp /></AccessGate>;
}
