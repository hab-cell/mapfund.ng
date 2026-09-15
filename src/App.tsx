import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/AuthContext";

import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ProtectedRoute, AdminProtectedRoute } from "@/components/ProtectedRoute";

import Home from "@/pages/Home";
import Campaigns from "@/pages/Campaigns";
import CampaignDetail from "@/pages/CampaignDetail";
import Transparency from "@/pages/Transparency";
import Community from "@/pages/Community";
import CommunityPostDetail from "@/pages/CommunityPostDetail";
import DonorDashboard from "@/pages/DonorDashboard";
import StudentRegister from "@/pages/StudentRegister";
import StudentDashboard from "@/pages/StudentDashboard";
import Login from "@/pages/Login";
import PaymentPortal from "@/pages/PaymentPortal";
import PaymentStatus from "@/pages/PaymentStatus";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminApplications from "@/pages/admin/AdminApplications";
import AdminApplicationDetail from "@/pages/admin/AdminApplicationDetail";
import AdminCampaigns from "@/pages/admin/AdminCampaigns";
import AdminFraudFlags from "@/pages/admin/AdminFraudFlags";
import AdminBankAccounts from "@/pages/admin/AdminBankAccounts";
import AdminDisbursements from "@/pages/admin/AdminDisbursements";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminSupabaseCheck from "@/pages/admin/AdminSupabaseCheck";
import AdminEmailLogs from "@/pages/admin/AdminEmailLogs";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminPaymentSettings from "@/pages/admin/AdminPaymentSettings";
import AdminEmailTest from "@/pages/admin/AdminEmailTest";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/transparency" element={<Transparency />} />
            <Route path="/community" element={<Community />} />
            <Route path="/community/:id" element={<CommunityPostDetail />} />
            <Route path="/donor" element={<DonorDashboard />} />
            <Route path="/register" element={<StudentRegister />} />
          </Route>

          {/* Single login — role-based redirect */}
          <Route path="/login" element={<Login />} />

          {/* Standalone payment */}
          <Route path="/payment" element={<PaymentPortal />} />
          <Route path="/payment-status" element={<PaymentStatus />} />

          {/* Student portal */}
          <Route element={<ProtectedRoute role="student" />}>
            <Route element={<DashboardLayout role="student" />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
            </Route>
          </Route>

          {/* Admin portal */}
          <Route element={<AdminProtectedRoute />}>
            <Route element={<DashboardLayout role="admin" />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/applications" element={<AdminApplications />} />
              <Route path="/admin/applications/:id" element={<AdminApplicationDetail />} />
              <Route path="/admin/campaigns" element={<AdminCampaigns />} />
              <Route path="/admin/fraud-flags" element={<AdminFraudFlags />} />
              <Route path="/admin/bank-accounts" element={<AdminBankAccounts />} />
              <Route path="/admin/disbursements" element={<AdminDisbursements />} />
              <Route path="/admin/audit-log" element={<AdminAuditLog />} />
              <Route path="/admin/supabase-check" element={<AdminSupabaseCheck />} />
              <Route path="/admin/email-logs" element={<AdminEmailLogs />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/payment-settings" element={<AdminPaymentSettings />} />
              <Route path="/admin/email-test" element={<AdminEmailTest />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
