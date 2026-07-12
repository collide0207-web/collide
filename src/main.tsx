import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { ModeSelect } from './rooms/ModeSelect'
import { InterviewSetupPage } from './rooms/InterviewSetupPage'
import { RoomPage } from './rooms/RoomPage'
import { ProblemsPage } from './problems/ProblemsPage'
import { ProblemDetailPage } from './problems/ProblemDetailPage'
import { DashboardPage } from './problems/DashboardPage'
import { WorkspacePage } from './workspace/WorkspacePage'
import './index.css'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/home', element: <ModeSelect /> },
  { path: '/interview/setup', element: <InterviewSetupPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/problems', element: <ProblemsPage /> },
  { path: '/problems/:slug', element: <ProblemDetailPage /> },
  { path: '/room/:roomId', element: <RoomPage /> },
  { path: '/workspace', element: <WorkspacePage /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
