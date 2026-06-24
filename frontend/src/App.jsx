import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import ProblemDetail from './pages/ProblemDetail'
import Workspace from './pages/Workspace'
import Result from './pages/Result'
import Leaderboard from './pages/Leaderboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/problem/:id" element={<ProblemDetail />} />
      <Route path="/workspace/:id" element={<Workspace />} />
      <Route path="/result/:id" element={<Result />} />
      <Route path="/leaderboard/:id" element={<Leaderboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
