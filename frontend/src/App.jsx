import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { ScrollToTop } from './components/common/ScrollToTop';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { BrowsePage } from './pages/BrowsePage';
import { PostResourcePage } from './pages/PostResourcePage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { resourceService } from './services/resourceService';
import { requestService } from './services/requestService';

function AppContent() {
  const { user } = useAuth();
  const [resources, setResources] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all resources & requests
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resList, reqList] = await Promise.all([
        resourceService.getResources(),
        requestService.getRequests()
      ]);
      setResources(resList || []);
      setRequests(reqList || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Publish new resource
  const handlePublishResource = async (formData) => {
    const created = await resourceService.createResource(formData);
    await loadData();
    return created;
  };

  // Submit request for resource
  const handleRequestResource = async (resource, message) => {
    const created = await requestService.submitRequest({
      resource,
      message,
    });
    await loadData();
    return created;
  };

  // Accept request (Owner)
  const handleAcceptRequest = async (requestId) => {
    await requestService.decideRequest(requestId, 'ACCEPT');
    await loadData();
  };

  // Reject request (Owner)
  const handleRejectRequest = async (requestId) => {
    await requestService.decideRequest(requestId, 'REJECT');
    await loadData();
  };

  // Mark claimed resource available again or confirm collection
  const handleMarkAvailable = async (resourceId, newStatus = 'AVAILABLE') => {
    await resourceService.updateStatus(resourceId, newStatus);
    await loadData();
  };

  // Dynamic statistics calculated directly from actual data
  const stats = {
    totalResources: resources.length,
    availableResources: resources.filter((r) => (r.status || '').toUpperCase() === 'AVAILABLE').length,
    claimedResources: resources.filter((r) =>
      ['CLAIMED', 'PENDING_CLAIM', 'BORROWED', 'GIVEN_AWAY'].includes((r.status || '').toUpperCase())
    ).length,
    totalRequests: requests.length,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ScrollToTop />
      <Navbar />

      <main style={{ flex: 1 }}>
        <Routes>
          {/* Home Page */}
          <Route 
            path="/" 
            element={
              <HomePage 
                resources={resources} 
                loading={loading} 
                stats={stats} 
              />
            } 
          />

          {/* Browse Resources */}
          <Route 
            path="/browse" 
            element={
              <BrowsePage 
                resources={resources} 
                loading={loading} 
              />
            } 
          />

          {/* Resource Details */}
          <Route 
            path="/resources/:id" 
            element={
              <ResourceDetailPage 
                allResources={resources} 
                onRequestResource={handleRequestResource} 
              />
            } 
          />

          {/* Post a Resource (Protected) */}
          <Route 
            path="/post-resource" 
            element={
              <ProtectedRoute>
                <PostResourcePage onSubmitResource={handlePublishResource} />
              </ProtectedRoute>
            } 
          />

          {/* User Dashboard & Sub-routes (Protected) */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage
                  resources={resources}
                  requests={requests}
                  loading={loading}
                  onAcceptRequest={handleAcceptRequest}
                  onRejectRequest={handleRejectRequest}
                  onMarkAvailable={handleMarkAvailable}
                />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/listings" 
            element={
              <ProtectedRoute>
                <DashboardPage
                  resources={resources}
                  requests={requests}
                  loading={loading}
                  onAcceptRequest={handleAcceptRequest}
                  onRejectRequest={handleRejectRequest}
                  onMarkAvailable={handleMarkAvailable}
                />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard/requests" 
            element={
              <ProtectedRoute>
                <DashboardPage
                  resources={resources}
                  requests={requests}
                  loading={loading}
                  onAcceptRequest={handleAcceptRequest}
                  onRejectRequest={handleRejectRequest}
                  onMarkAvailable={handleMarkAvailable}
                />
              </ProtectedRoute>
            } 
          />

          {/* Authentication Pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Catch-all 404 Route */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
