import { Navigate, Route, Routes } from "react-router-dom";
import { Overview } from "@/pages/Overview";
import { Cybersecurity } from "@/pages/Cybersecurity";
import { Compliance } from "@/pages/Compliance";
import { Playbooks } from "@/pages/Playbooks";
import { Connectors } from "@/pages/Connectors";
import { Approvals } from "@/pages/Approvals";
import { AuthGate } from "@/components/AuthGate";
import { Toaster } from "@/components/ui/Toaster";

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/cybersecurity" element={<Cybersecurity />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/playbooks" element={<Playbooks />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </AuthGate>
  );
}
