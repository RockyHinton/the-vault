import { useState } from "react";
import { format } from "date-fns";
import { MoreHorizontal, Plus, ShieldCheck, UserX, UserCheck, Shield } from "lucide-react";
import type { ApplicationRole, VaultUser } from "@shared/contracts";
import { Shell } from "@/components/layout/Shell";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useAuditEvents } from "@/features/audit/use-audit-events";
import {
  useChangeUserRole,
  useProvisionUser,
  useReinstateUser,
  useSuspendUser,
  useUsers,
} from "@/features/users/use-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const roleLabel: Record<ApplicationRole, string> = {
  studio_admin: "Studio admin",
  user: "User",
};

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const provision = useProvisionUser();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ApplicationRole>("user");

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("user");
  };

  const submit = async () => {
    try {
      await provision.mutateAsync({ displayName, email, password, role });
      reset();
      onOpenChange(false);
    } catch {
      // The mutation hook has already shown the error; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Creates the sign-in identity and grants Vault access. Share the initial password with the person
            directly; they can change it after signing in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-user-name">Name</Label>
            <Input id="new-user-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Initial password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">At least 8 characters. Weak or breached passwords are rejected.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as ApplicationRole)}>
              <SelectTrigger id="new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="studio_admin">Studio admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={provision.isPending || !displayName.trim() || !email.trim() || password.length < 8}
          >
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, selfId }: { user: VaultUser; selfId: string | undefined }) {
  const changeRole = useChangeUserRole();
  const suspend = useSuspendUser();
  const reinstate = useReinstateUser();
  const isSelf = user.id === selfId;
  const busy = changeRole.isPending || suspend.isPending || reinstate.isPending;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{user.displayName ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{user.email ?? "—"}</div>
      </TableCell>
      <TableCell>
        <Badge variant={user.role === "studio_admin" ? "default" : "secondary"}>{roleLabel[user.role]}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={user.status === "active" ? "outline" : "destructive"}>
          {user.status === "active" ? "Active" : "Suspended"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{format(new Date(user.createdAt), "d MMM yyyy")}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy} aria-label={`Actions for ${user.email ?? user.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user.role === "user" ? (
              <DropdownMenuItem onClick={() => changeRole.mutate({ id: user.id, role: "studio_admin", version: user.version })}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Make studio admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={isSelf}
                onClick={() => changeRole.mutate({ id: user.id, role: "user", version: user.version })}
              >
                <Shield className="mr-2 h-4 w-4" /> Make ordinary user
              </DropdownMenuItem>
            )}
            {user.status === "active" ? (
              <DropdownMenuItem
                disabled={isSelf}
                className="text-destructive focus:text-destructive"
                onClick={() => suspend.mutate({ id: user.id, version: user.version })}
              >
                <UserX className="mr-2 h-4 w-4" /> Suspend
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => reinstate.mutate({ id: user.id, version: user.version })}>
                <UserCheck className="mr-2 h-4 w-4" /> Reinstate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function UsersTab() {
  const users = useUsers();
  const { data: me } = useCurrentUser();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Access to this Vault is granted here. Signing in with an identity alone never grants access.
          </CardDescription>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add user
        </Button>
      </CardHeader>
      <CardContent>
        {users.isLoading && <p className="text-sm text-muted-foreground">Loading users…</p>}
        {users.isError && <p className="text-sm text-destructive">Users could not be loaded.</p>}
        {users.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.data.items.map((user) => (
                <UserRow key={user.id} user={user} selfId={me?.data.user.id} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}

function AuditTab() {
  const events = useAuditEvents();
  const items = events.data?.pages.flatMap((page) => page.data.items) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Every state change recorded by the server, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.isLoading && <p className="text-sm text-muted-foreground">Loading audit events…</p>}
        {events.isError && <p className="text-sm text-destructive">Audit events could not be loaded.</p>}
        {events.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">No audit events yet.</TableCell>
                </TableRow>
              )}
              {items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-sm">{format(new Date(event.createdAt), "d MMM yyyy HH:mm:ss")}</TableCell>
                  <TableCell><code className="text-xs">{event.action}</code></TableCell>
                  <TableCell className="text-sm">{event.actor?.displayName ?? event.actor?.email ?? "System"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {event.entityType}
                    {event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{event.requestId.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {events.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>
              Load older events
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-8 pt-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Users &amp; Access</h1>
          <p className="text-muted-foreground mt-1">
            Manage who can use this Vault deployment and review what has changed.
          </p>
        </div>
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}
