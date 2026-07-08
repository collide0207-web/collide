import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { ModeSelect } from './rooms/ModeSelect'
import { InterviewSetupPage } from './rooms/InterviewSetupPage'
import { RoomPage } from './rooms/RoomPage'
import './index.css'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/home', element: <ModeSelect /> },
  { path: '/interview/setup', element: <InterviewSetupPage /> },
  { path: '/room/:roomId', element: <RoomPage /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
