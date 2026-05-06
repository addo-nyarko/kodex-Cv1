import { Suspense } from "react";
import ProjectList from "./ProjectList";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-muted-foreground">Loading...</div></div>}>
      <ProjectList />
    </Suspense>
  );
}
