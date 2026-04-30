import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Workspace from "@/pages/Workspace";
import Dashboard from "@/pages/Dashboard";
import RepoView from "@/pages/RepoView";
import GlobalTerminal from "@/components/GlobalTerminal";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/repos/:id" component={RepoView} />
      <Route path="/workspace" component={Workspace} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <GlobalTerminal />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
