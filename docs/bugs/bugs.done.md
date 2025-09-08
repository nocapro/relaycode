#### VERIFY

fire system notification on failed patch roll back

#### VERIFY

innacurate insertion and deletion count

#### VERIFY

innacurate linter problem count. use npm lib to real check linter problems than string based.

#### VERIFY

handle double patch code with different strategy / multiple patch operations for the same file. like new-unified, then multi-search-replace, then rename


```typescript // src/components/FileExplorerToolbar.tsx new-unified
--- src/components/FileExplorerToolbar.tsx
+++ src/components/FileExplorerToolbar.tsx
@@ -1,4 +1,5 @@
 import {
+  useAtom, useSetAtom
 } from 'lucide-react'
 import {
   Home,
@@ -11,26 +12,30 @@
   Rocket,
   TerminalSquare
 } from 'lucide-react'
 import { Button } from '@/components/ui/button'
 import { WorkflowStep } from '@/types/type'
 import { cn } from '@/lib/utils'
-
-interface FileExplorerToolbarProps {
-  onBackToProjects: () => void
-  sidebarOpen: boolean
-  onToggleSidebar: () => void
-  workflowStep: WorkflowStep
-  onWorkflowStepChange: (step: WorkflowStep) => void
-  onShowAdvancedSettings: () => void
-}
+import {
+  currentProjectAtom,
+  sidebarOpenAtom,
+  workflowStepAtom,
+  showAdvancedSettingsAtom,
+} from '@/state-management/state/atoms'

-export function FileExplorerToolbar({
-  onBackToProjects,
-  sidebarOpen,
-  onToggleSidebar,
-  workflowStep,
-  onWorkflowStepChange,
-  onShowAdvancedSettings
-}: FileExplorerToolbarProps) {
+export function FileExplorerToolbar() {
+  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)
+  const [workflowStep, setWorkflowStep] = useAtom(workflowStepAtom)
+  const setCurrentProject = useSetAtom(currentProjectAtom)
+  const setShowAdvancedSettings = useSetAtom(showAdvancedSettingsAtom)
+
+  const onBackToProjects = () => setCurrentProject(null)
+  const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
+  const onWorkflowStepChange = (step: WorkflowStep) => setWorkflowStep(step)
+  const onShowAdvancedSettings = () => setShowAdvancedSettings(true)

   const navItems = [
     { id: 'task', label: 'Task', icon: ClipboardList },
     { id: 'context', label: 'Context', icon: BoxSelect },
```
The `lucide-react` import was a mistake in my thought process, the final code needs to import from `jotai`.

```typescript // src/components/FileExplorerToolbar.tsx multi-search-replace
<<<<<<< SEARCH
import {
  Home,
  PanelLeftOpen,
  PanelLeftClose,
  Settings,
  ClipboardList,
  BoxSelect,
  Rocket,
  TerminalSquare
} from 'lucide-react'
=======
import { useAtom, useSetAtom } from 'jotai'
import {
  Home,
  PanelLeftOpen,
  PanelLeftClose,
  Settings,
  ClipboardList,
  BoxSelect,
  Rocket,
  TerminalSquare
} from 'lucide-react'
>>>>>>> REPLACE
```


#### VERIFY

multiple yaml conditions

```yaml

vs

```
yaml

yaml
