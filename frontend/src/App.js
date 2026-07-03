import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import { RequireAuth, RedirectIfAuthed } from "@/components/RouteGuards";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import NewDebate from "@/pages/NewDebate";
import DebateSession from "@/pages/DebateSession";
import DebateReport from "@/pages/DebateReport";
import History from "@/pages/History";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster theme="dark" position="top-right" richColors closeButton />
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
              <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/new" element={<RequireAuth><NewDebate /></RequireAuth>} />
              <Route path="/debate/:id" element={<RequireAuth><DebateSession /></RequireAuth>} />
              <Route path="/report/:id" element={<RequireAuth><DebateReport /></RequireAuth>} />
              <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
