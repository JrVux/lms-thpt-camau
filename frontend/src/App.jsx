import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ClassDetail from './pages/ClassDetail';
import CreateAssignment from './pages/CreateAssignment';
import CodingEditor from './pages/CodingEditor';
import SqlEditor from './pages/SqlEditor';
import HtmlEditor from './pages/HtmlEditor';
import HTMLPractice from './pages/HTMLPractice';
import SQLPractice from './pages/SQLPractice';
import PythonPractice from './pages/PythonPractice';

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/classes" replace />;
};

const App = () => {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/unauthorized" element={<div className="min-h-screen flex items-center justify-center text-xl text-gray-500">Bạn không có quyền truy cập trang này</div>} />

      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/classes" element={<Dashboard />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="/classes/:id/assignments/new" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/classes/:classId/assignments/:assignmentId/edit" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/coding/:id" element={<PrivateRoute><CodingEditor /></PrivateRoute>} />
        <Route path="/python-practice/:id" element={<PrivateRoute><PythonPractice /></PrivateRoute>} />
        <Route path="/sql-editor/:id" element={<PrivateRoute><SqlEditor /></PrivateRoute>} />
        <Route path="/sql-practice/:id" element={<PrivateRoute><SQLPractice /></PrivateRoute>} />
        <Route path="/html-editor/:id" element={<PrivateRoute><HtmlEditor /></PrivateRoute>} />
        <Route path="/html-practice/:id" element={<PrivateRoute><HTMLPractice /></PrivateRoute>} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </ErrorBoundary>
  );
};

export default App;
