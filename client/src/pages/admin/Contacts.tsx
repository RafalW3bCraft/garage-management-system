import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { 
  Loader2, Mail, Phone, MessageSquare, ArrowLeft, ChevronLeft, ChevronRight, Trash2, 
  Download, Search, X, Calendar as CalendarIcon, StickyNote, ChevronDown, Filter
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "new" | "responded" | "resolved";
  notes?: string | null;
  notesUpdatedAt?: string | null;
  createdAt: string;
}

interface ContactsResponse {
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

type DatePreset = "last7" | "last30" | "custom";

export default function AdminContacts() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  
  const searchParams = new URLSearchParams(window.location.search);
  const initialPage = parseInt(searchParams.get("page") || "1");
  const initialStatus = searchParams.get("status") || "all";
  const initialSearch = searchParams.get("search") || "";
  const initialStartDate = searchParams.get("startDate") || "";
  const initialEndDate = searchParams.get("endDate") || "";

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  const [startDate, setStartDate] = useState<Date | undefined>(initialStartDate ? new Date(initialStartDate) : undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(initialEndDate ? new Date(initialEndDate) : undefined);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const pageSize = 20;

  const hasActiveFilters = statusFilter !== "all" || searchQuery !== "" || startDate !== undefined || endDate !== undefined;
  const activeFilterCount = [
    statusFilter !== "all",
    searchQuery !== "",
    startDate !== undefined,
    endDate !== undefined
  ].filter(Boolean).length;

  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPage > 1) params.set("page", currentPage.toString());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    if (startDate) params.set("startDate", startDate.toISOString());
    if (endDate) params.set("endDate", endDate.toISOString());
    
    const newSearch = params.toString();
    const newUrl = `/admin/contacts${newSearch ? `?${newSearch}` : ""}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.pushState({}, "", newUrl);
    }
  }, [currentPage, statusFilter, searchQuery, startDate, endDate]);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    params.set("limit", pageSize.toString());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    if (startDate) params.set("startDate", startDate.toISOString().split('T')[0]);
    if (endDate) params.set("endDate", endDate.toISOString().split('T')[0]);
    return params.toString();
  };

  const { data, isLoading, isError, error } = useQuery<ContactsResponse>({
    queryKey: ["/api/admin/contacts", currentPage, statusFilter, searchQuery, startDate, endDate],
    enabled: isAuthenticated && user?.role === "admin",
    queryFn: async () => {
      const response = await apiRequestJson<ContactsResponse>(
        "GET",
        `/api/admin/contacts?${buildQueryParams()}`
      );
      return response;
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, updates }: { contactId: string; updates: { status?: string; notes?: string } }) => {
      return apiRequestJson("PATCH", `/api/admin/contacts/${contactId}`, updates);
    },
    onSuccess: (_, variables) => {
      if (variables.updates.notes !== undefined) {
        toast({
          title: "Notes Saved",
          description: "Contact notes have been saved successfully.",
        });
      } else {
        toast({
          title: "Status Updated",
          description: "Contact status has been updated successfully.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update contact.",
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequestJson("DELETE", `/api/admin/contacts/${contactId}`);
    },
    onSuccess: () => {
      toast({
        title: "Contact Deleted",
        description: "The contact has been permanently deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete contact.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequestJson<{ deletedCount: number }>("POST", "/api/admin/contacts/bulk-delete", { ids });
    },
    onSuccess: (data: { deletedCount: number }) => {
      toast({
        title: "Contacts Deleted",
        description: `Successfully deleted ${data.deletedCount} contact(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contacts"] });
      setSelectedContacts(new Set());
      setBulkDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk Delete Failed",
        description: error.message || "Failed to delete contacts.",
        variant: "destructive",
      });
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData: any = {};
      if (statusFilter !== "all") exportData.status = statusFilter;
      if (searchQuery) exportData.search = searchQuery;
      if (startDate) exportData.startDate = startDate.toISOString().split('T')[0];
      if (endDate) exportData.endDate = endDate.toISOString().split('T')[0];

      const response = await fetch("/api/admin/contacts/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Contacts have been exported to CSV.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export contacts.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === "last7") {
      setStartDate(subDays(today, 7));
      setEndDate(today);
    } else if (preset === "last30") {
      setStartDate(subDays(today, 30));
      setEndDate(today);
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
    setStartDate(undefined);
    setEndDate(undefined);
    setDatePreset("custom");
    setCurrentPage(1);
  };

  const toggleNotesExpanded = (contactId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(contactId)) {
      newExpanded.delete(contactId);
    } else {
      newExpanded.add(contactId);
    }
    setExpandedNotes(newExpanded);
  };

  const handleNotesChange = (contactId: string, value: string) => {
    setNotesValues(prev => ({ ...prev, [contactId]: value }));
  };

  const handleNotesSave = (contactId: string) => {
    const notes = notesValues[contactId];
    updateContactMutation.mutate({ contactId, updates: { notes } });
  };

  const handleNotesBlur = (contactId: string, originalNotes?: string | null) => {
    const currentNotes = notesValues[contactId];
    if (currentNotes !== undefined && currentNotes !== (originalNotes || "")) {
      handleNotesSave(contactId);
    }
  };

  useEffect(() => {
    if (data?.contacts) {
      const initialNotes: Record<string, string> = {};
      data.contacts.forEach(contact => {
        if (contact.notes && !notesValues[contact.id]) {
          initialNotes[contact.id] = contact.notes;
        }
      });
      if (Object.keys(initialNotes).length > 0) {
        setNotesValues(prev => ({ ...prev, ...initialNotes }));
      }
    }
  }, [data?.contacts]);

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-4">You need admin privileges to access this page.</p>
        <Link href="/">
          <Button>Return Home</Button>
        </Link>
      </div>
    );
  }

  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Failed to load contacts",
        description: error instanceof Error ? error.message : "Unable to fetch contacts",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500 text-white";
      case "responded":
        return "bg-yellow-500 text-white";
      case "resolved":
        return "bg-green-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const isCarInquiry = (subject: string) => {
    return subject.toLowerCase().includes("car inquiry");
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.contacts) {
      setSelectedContacts(new Set(data.contacts.map(c => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSelected = new Set(selectedContacts);
    if (checked) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleDeleteContact = (contactId: string) => {
    setContactToDelete(contactId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (contactToDelete) {
      deleteContactMutation.mutate(contactToDelete);
    }
  };

  const handleBulkDelete = () => {
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedContacts));
  };

  useEffect(() => {
    setSelectedContacts(new Set());
  }, [currentPage, statusFilter, searchQuery, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contact Messages</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer inquiries and contact form submissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting || !data?.contacts.length}
            variant="outline"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export to CSV
              </>
            )}
          </Button>
          {selectedContacts.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedContacts.size})
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount} active
                </Badge>
              )}
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, email, or subject..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contacts</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Select value={datePreset} onValueChange={(value) => handleDatePresetChange(value as DatePreset)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="last7">Last 7 days</SelectItem>
                    <SelectItem value="last30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Start - End Date</label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "MMM d") : "Start"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                          setStartDate(date);
                          setDatePreset("custom");
                          setCurrentPage(1);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "MMM d") : "End"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(date) => {
                          setEndDate(date);
                          setDatePreset("custom");
                          setCurrentPage(1);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              {data && (
                <p className="text-sm text-muted-foreground">
                  Showing {data.contacts.length} of {data.pagination.total} contacts
                </p>
              )}
              {data && data.contacts.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={data.contacts.length > 0 && selectedContacts.size === data.contacts.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    Select All on Page
                  </label>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {data?.contacts.map((contact) => (
          <Card key={contact.id} className={isCarInquiry(contact.subject) ? "border-l-4 border-l-primary" : ""}>
            <CardContent className="p-6">
              <div className="flex gap-4 items-start mb-4">
                <Checkbox
                  checked={selectedContacts.has(contact.id)}
                  onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{contact.name}</h3>
                      <Badge className={getStatusColor(contact.status)}>
                        {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                      </Badge>
                      {isCarInquiry(contact.subject) && (
                        <Badge variant="outline">Car Inquiry</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm text-muted-foreground">
                        {new Date(contact.createdAt).toLocaleDateString()} {new Date(contact.createdAt).toLocaleTimeString()}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteContact(contact.id)}
                        disabled={deleteContactMutation.isPending}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">{contact.subject}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.phone}</span>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-md mb-4">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-1" />
                  <p className="text-sm">{contact.message}</p>
                </div>
              </div>

              <Collapsible open={expandedNotes.has(contact.id)} onOpenChange={() => toggleNotesExpanded(contact.id)}>
                <div className="flex items-center justify-between mb-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-0 h-auto">
                      <StickyNote className="h-4 w-4 mr-2" />
                      <span className="text-sm font-medium">
                        Notes
                        {contact.notesUpdatedAt && (
                          <span className="text-muted-foreground ml-2">
                            (updated {new Date(contact.notesUpdatedAt).toLocaleDateString()})
                          </span>
                        )}
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 ml-2 transition-transform",
                        expandedNotes.has(contact.id) && "transform rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="space-y-2">
                  <Textarea
                    placeholder="Add notes about this contact..."
                    value={notesValues[contact.id] || ""}
                    onChange={(e) => handleNotesChange(contact.id, e.target.value)}
                    onBlur={() => handleNotesBlur(contact.id, contact.notes)}
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleNotesSave(contact.id)}
                      disabled={updateContactMutation.isPending || notesValues[contact.id] === (contact.notes || "")}
                    >
                      {updateContactMutation.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Notes"
                      )}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2 mt-4">
                <Select
                  value={contact.status}
                  onValueChange={(value) =>
                    updateContactMutation.mutate({ contactId: contact.id, updates: { status: value } })
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}

        {data?.contacts.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No contacts found matching your criteria</p>
            </CardContent>
          </Card>
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={currentPage === data.pagination.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone and will permanently remove the contact message from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteContactMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteContactMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContactMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Contacts</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedContacts.size} contact(s)? This action cannot be undone and will permanently remove all selected contact messages from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedContacts.size} Contact(s)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
