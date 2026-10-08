import { useHashRoute } from "./hooks";
import VehicleList from "./pages/VehicleList";
import VehicleDetail from "./pages/VehicleDetail";
import Editor from "./pages/Editor";
import SettingsPage from "./pages/Settings";
import Import from "./pages/Import";

export default function App() {
  const route = useHashRoute();
  let m: RegExpMatchArray | null;
  if ((m = route.match(/^\/v\/([^/]+)\/p\/([^/]+)$/))) return <Editor key={m[2]} vehicleId={m[1]} photoId={m[2]} />;
  if ((m = route.match(/^\/v\/([^/]+)$/))) return <VehicleDetail key={m[1]} id={m[1]} />;
  if (route === "/settings") return <SettingsPage />;
  if (route === "/import") return <Import />;
  return <VehicleList />;
}
