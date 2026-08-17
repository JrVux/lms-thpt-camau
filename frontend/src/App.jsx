import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ClassDetail from './pages/ClassDetail';
import CreateAssignment from './pages/CreateAssignment';
import AssignmentLibrary from './pages/AssignmentLibrary';
import MyAssignments from './pages/MyAssignments';
import CodingEditor from './pages/CodingEditor';
import SqlEditor from './pages/SqlEditor';
import HtmlEditor from './pages/HtmlEditor';
import HTMLPractice from './pages/HTMLPractice';
import SQLPractice from './pages/SQLPractice';
import PythonPractice from './pages/PythonPractice';
import PythonAssistant from './pages/PythonAssistant';
import LearningPath from './pages/LearningPath';
import DocumentManager from './pages/DocumentManager';
import ExerciseReview from './pages/ExerciseReview';
import VisualizerDemo from './pages/VisualizerDemo';
import OmniDashboard from './pages/OmniDashboard';

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/classes" replace />;
};

const AssignmentHome = () => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <AssignmentLibrary /> : <MyAssignments />;
};

const App = () => {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/unauthorized" element={<div className="min-h-screen flex items-center justify-center text-xl text-gray-500">Bạn không có quyền truy cập trang này</div>} />

      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/omni-dashboard" element={<OmniDashboard />} />
        <Route path="/classes" element={<Dashboard />} />
        <Route path="/classes/:id" element={<ClassDetail />} />
        <Route path="/classes/:id/assignments/new" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/classes/:classId/assignments/:assignmentId/edit" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/assignments" element={<AssignmentHome />} />
        <Route path="/assignments/new" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/assignments/:assignmentId/edit" element={<PrivateRoute role="teacher"><CreateAssignment /></PrivateRoute>} />
        <Route path="/coding/:id" element={<PrivateRoute><CodingEditor /></PrivateRoute>} />
        <Route path="/python-practice/:id" element={<PrivateRoute><PythonPractice /></PrivateRoute>} />
        <Route path="/sql-editor/:id" element={<PrivateRoute><SqlEditor /></PrivateRoute>} />
        <Route path="/sql-practice/:id" element={<PrivateRoute><SQLPractice /></PrivateRoute>} />
        <Route path="/html-editor/:id" element={<PrivateRoute><HtmlEditor /></PrivateRoute>} />
        <Route path="/html-practice/:id" element={<PrivateRoute><HTMLPractice /></PrivateRoute>} />
        <Route path="/deliveries/:deliveryId/python-practice" element={<PrivateRoute role="student"><PythonPractice /></PrivateRoute>} />
        <Route path="/deliveries/:deliveryId/sql-practice" element={<PrivateRoute role="student"><SQLPractice /></PrivateRoute>} />
        <Route path="/deliveries/:deliveryId/html-practice" element={<PrivateRoute role="student"><HTMLPractice /></PrivateRoute>} />
        <Route path="/python-assistant" element={<PrivateRoute role="teacher"><PythonAssistant /></PrivateRoute>} />
        <Route path="/python-assistant/learning-path" element={<PrivateRoute role="teacher"><LearningPath /></PrivateRoute>} />
        <Route path="/python-assistant/documents" element={<PrivateRoute role="teacher"><DocumentManager /></PrivateRoute>} />
        <Route path="/python-assistant/exercises/review" element={<PrivateRoute role="teacher"><ExerciseReview /></PrivateRoute>} />
        <Route path="/visualizer/:slug" element={<PrivateRoute><VisualizerDemo /></PrivateRoute>} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </ErrorBoundary>
  );
};

export default App;
