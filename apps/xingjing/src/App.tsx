import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import SoloLayout from './components/Layout/SoloLayout';
import AIPanel from './components/AIAssistant/AIPanel';
import RequirementWorkshop from './pages/RequirementWorkshop';
import PRDEditor from './pages/RequirementWorkshop/PRDEditor';
import DesignWorkshop from './pages/DesignWorkshop';
import DevWorkshop from './pages/DevWorkshop';
import PRSubmit from './pages/DevWorkshop/PRSubmit';
import SprintCenter from './pages/SprintCenter';
import SprintPlan from './pages/SprintCenter/SprintPlan';
import QualityCenter from './pages/QualityCenter';
import Dashboard from './pages/Dashboard';
import KnowledgeCenter from './pages/KnowledgeCenter';
import ProductPlanning from './pages/ProductPlanning';
// Solo mode pages
import SoloFocus from './pages/Solo/Focus';
import SoloProduct from './pages/Solo/Product';
import SoloBuild from './pages/Solo/Build';
import SoloRelease from './pages/Solo/Release';
import SoloReview from './pages/Solo/Review';
import SoloKnowledge from './pages/Solo/Knowledge';
import SoloAutopilot from './pages/Solo/Autopilot';
import SoloAgentWorkshop from './pages/Solo/AgentWorkshop';
// Autopilot
import Autopilot from './pages/Autopilot';
import AgentWorkshop from './pages/AgentWorkshop';
import ReleaseOps from './pages/ReleaseOps';
import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <>
      <Routes>
        {/* Enterprise Mode */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/autopilot" replace />} />
          <Route path="/planning" element={<ProductPlanning />} />
          <Route path="/requirements" element={<RequirementWorkshop />} />
          <Route path="/requirements/edit/:id" element={<PRDEditor />} />
          <Route path="/design" element={<DesignWorkshop />} />
          <Route path="/dev" element={<DevWorkshop />} />
          <Route path="/dev/pr/:taskId" element={<PRSubmit />} />
          <Route path="/sprint" element={<SprintCenter />} />
          <Route path="/sprint/plan" element={<SprintPlan />} />
          <Route path="/quality" element={<QualityCenter />} />
          <Route path="/release-ops" element={<ReleaseOps />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/knowledge" element={<KnowledgeCenter />} />
          <Route path="/agent-workshop" element={<AgentWorkshop />} />
          <Route path="/autopilot" element={<Autopilot />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Solo Mode */}
        <Route element={<SoloLayout />}>
          <Route path="/solo" element={<Navigate to="/solo/autopilot" replace />} />
          <Route path="/solo/focus"     element={<SoloFocus />} />
          <Route path="/solo/product"   element={<SoloProduct />} />
          <Route path="/solo/build"     element={<SoloBuild />} />
          <Route path="/solo/release"   element={<SoloRelease />} />
          <Route path="/solo/review"    element={<SoloReview />} />
          <Route path="/solo/knowledge" element={<SoloKnowledge />} />
          <Route path="/solo/agent-workshop" element={<SoloAgentWorkshop />} />
          <Route path="/solo/autopilot" element={<SoloAutopilot />} />
          <Route path="/solo/settings" element={<Settings />} />
        </Route>
      </Routes>
      <AIPanel />
    </>
  );
};

export default App;
