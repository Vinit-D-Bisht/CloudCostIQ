import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import RequireAuth from "@/components/RequireAuth";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<Auth />} />
      <Route path="/signup" element={<Auth />} />
    </Routes>
  );
}
