import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { useStore, UserRole, AuditAction } from "@/lib/store";
import { APP_CONFIG } from "@/config/app-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Shield, 
  Users, 
  Activity, 
  Lock, 
  Database, 
  Cloud,
  UserPlus,
  Trash2,
  FileKey
} from "lucide-react";
import { format } from "date-fns";

export default function AdminSettings() {
  const { users, auditLogs } = useStore();

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Settings & Administration</h1>
          <p className="text-muted-foreground mt-2">Manage security, access control, and deployment configuration.</p>
        </div>

        {/* Branding / Deployment Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <Cloud className="h-4 w-4" />
                 Deployment Instance
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{APP_CONFIG.clientName}</div>
               <div className="text-xs font-mono text-muted-foreground mt-1">
                 ID: {APP_CONFIG.deploymentId} | Env: {APP_CONFIG.environment}
               </div>
             </CardContent>
           </Card>

           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <Database className="h-4 w-4" />
                 Data Isolation
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="flex items-center gap-2">
                 <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Private Database</Badge>
                 <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Encrypted Storage</Badge>
               </div>
               <p className="text-xs text-muted-foreground mt-2">
                 Data is isolated to this specific client instance.
               </p>
             </CardContent>
           </Card>

           <Card>
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                 <Shield className="h-4 w-4" />
                 Security Policy
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-sm font-medium">AES-256 Encryption</div>
               <p className="text-xs text-muted-foreground mt-1">
                 Session Timeout: {APP_CONFIG.security.sessionTimeout}
               </p>
             </CardContent>
           </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users & Roles</TabsTrigger>
            <TabsTrigger value="audit" className="gap-2"><Activity className="h-4 w-4" /> Audit Logs</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><Lock className="h-4 w-4" /> Security Config</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Authorized Users</CardTitle>
                  <CardDescription>Manage who has access to this private instance.</CardDescription>
                </div>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" /> Invite User
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Access Level</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{u.name}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'Admin' ? 'default' : 'secondary'}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.role === 'Admin' ? 'Full Access' : u.role === 'Producer' ? 'Write Access' : 'Read Only'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
             <Card>
               <CardHeader>
                 <CardTitle>System Audit Logs</CardTitle>
                 <CardDescription>Immutable record of all sensitive actions within this deployment.</CardDescription>
               </CardHeader>
               <CardContent>
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Action</TableHead>
                       <TableHead>User</TableHead>
                       <TableHead>Details</TableHead>
                       <TableHead>IP Address</TableHead>
                       <TableHead className="text-right">Time</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {auditLogs.map((log) => (
                       <TableRow key={log.id}>
                         <TableCell>
                           <Badge variant="outline" className="font-mono text-xs">
                             {log.action}
                           </Badge>
                         </TableCell>
                         <TableCell className="text-sm font-medium">{log.userName}</TableCell>
                         <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
                         <TableCell className="text-sm font-mono text-muted-foreground">{log.ipAddress}</TableCell>
                         <TableCell className="text-right text-sm text-muted-foreground">
                           {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </CardContent>
             </Card>
          </TabsContent>

          {/* Security Config Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Configuration</CardTitle>
                <CardDescription>Advanced security settings for this instance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Password Policy</Label>
                    <div className="p-3 border rounded-md bg-secondary/20 text-sm">
                      <div className="font-medium mb-1">Current Policy: Strong</div>
                      <ul className="list-disc list-inside text-muted-foreground text-xs space-y-1">
                        <li>Minimum 12 characters</li>
                        <li>Requires uppercase & lowercase</li>
                        <li>Requires numbers & symbols</li>
                        <li>Expiration: 90 days</li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Session Security</Label>
                    <div className="p-3 border rounded-md bg-secondary/20 text-sm">
                      <div className="font-medium mb-1">Active Settings</div>
                      <ul className="list-disc list-inside text-muted-foreground text-xs space-y-1">
                        <li>Idle Timeout: {APP_CONFIG.security.sessionTimeout}</li>
                        <li>Force Re-login on IP Change: Enabled</li>
                        <li>Concurrent Sessions: Max 3</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                   <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-destructive">
                     <FileKey className="h-4 w-4" />
                     Encryption Keys
                   </h3>
                   <div className="flex items-center justify-between p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
                      <div>
                        <div className="font-medium text-destructive">Master Encryption Key</div>
                        <div className="text-xs text-muted-foreground">Used to encrypt all files at rest. Do not lose this.</div>
                      </div>
                      <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                        Rotate Key
                      </Button>
                   </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </Shell>
  );
}
