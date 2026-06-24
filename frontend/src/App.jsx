import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Home from './pages/Home'
import ProblemDetail from './pages/ProblemDetail'
import Workspace from './pages/Workspace'
import Leaderboard from './pages/Leaderboard'
import ProblemCreate from './pages/ProblemCreate'
import LoginModal from './components/LoginModal'
import Toaster from './components/Toaster'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/problems" element={<Home />} />
        <Route path="/problems/create" element={<ProblemCreate />} />
        <Route path="/problem/:id" element={<ProblemDetail />} />
        <Route path="/workspace/:id" element={<Workspace />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/leaderboard/:id" element={<Leaderboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* global, portal-rendered — one instance for the whole app */}
      <LoginModal />
      <Toaster />
    </>
  )
}
