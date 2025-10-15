import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Plus, Trash2, Send, Eye, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface InvoiceItem {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
  displayOrder: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerState: string;
  subtotal: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  status: string;
  invoiceDate: string;
  items: InvoiceItem[];
}

export default function AdminInvoices() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("list");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [invoiceData, setInvoiceData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    customerCity: "",
    customerState: "Gujarat",
    customerZipCode: "",
    customerGSTIN: "",
    businessState: "Gujarat",
    businessGSTIN: "",
    notes: "",
    termsAndConditions: "Payment due within 30 days"
  });
  
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      description: "",
      quantity: "1",
      unitPrice: "0",
      amount: "0",
      taxRate: "18",
      taxAmount: "0",
      displayOrder: 1
    }
  ]);

  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["/api/admin/invoices"],
    queryFn: async () => {
      const response = await apiRequestJson("GET", "/api/admin/invoices");
      return response.data;
    },
    enabled: isAuthenticated && user?.role === "admin"
  });

  const { data: eligibleTransactions } = useQuery({
    queryKey: ["/api/admin/invoices/eligible-transactions"],
    queryFn: async () => {
      return apiRequestJson("GET", "/api/admin/invoices/eligible-transactions");
    },
    enabled: isAuthenticated && user?.role === "admin" && activeTab === "create"
  });

  const calculateGST = (subtotal: number, taxRate: number, customerState: string, businessState: string) => {
    const taxAmount = (subtotal * taxRate) / 100;
    const isIntraState = customerState === businessState;
    
    if (isIntraState) {
      return {
        cgst: (taxAmount / 2).toFixed(2),
        sgst: (taxAmount / 2).toFixed(2),
        igst: "0.00"
      };
    } else {
      return {
        cgst: "0.00",
        sgst: "0.00",
        igst: taxAmount.toFixed(2)
      };
    }
  };

  const calculateItemAmount = (quantity: string, unitPrice: string) => {
    return (parseFloat(quantity) * parseFloat(unitPrice)).toFixed(2);
  };

  const calculateItemTax = (amount: string, taxRate: string) => {
    return ((parseFloat(amount) * parseFloat(taxRate)) / 100).toFixed(2);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === "quantity" || field === "unitPrice") {
      const amount = calculateItemAmount(newItems[index].quantity, newItems[index].unitPrice);
      newItems[index].amount = amount;
      newItems[index].taxAmount = calculateItemTax(amount, newItems[index].taxRate);
    } else if (field === "taxRate") {
      newItems[index].taxAmount = calculateItemTax(newItems[index].amount, newItems[index].taxRate);
    }
    
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, {
      description: "",
      quantity: "1",
      unitPrice: "0",
      amount: "0",
      taxRate: "18",
      taxAmount: "0",
      displayOrder: items.length + 1
    }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const avgTaxRate = items.length > 0 
      ? items.reduce((sum, item) => sum + parseFloat(item.taxRate), 0) / items.length 
      : 18;
    
    const gst = calculateGST(subtotal, avgTaxRate, invoiceData.customerState, invoiceData.businessState);
    const total = subtotal + parseFloat(gst.cgst) + parseFloat(gst.sgst) + parseFloat(gst.igst);
    
    return {
      subtotal: subtotal.toFixed(2),
      ...gst,
      total: total.toFixed(2)
    };
  };

  const loadTransactionData = (transaction: any) => {
    setSelectedTransaction(transaction);
    
    if (transaction.type === 'service') {
      setInvoiceData({
        ...invoiceData,
        customerName: transaction.customerName || "",
        customerEmail: transaction.customerEmail || "",
        customerPhone: transaction.customerPhone || "",
      });
      
      setItems([{
        description: transaction.serviceName || "Service",
        quantity: "1",
        unitPrice: (transaction.servicePrice || 0).toString(),
        amount: (transaction.servicePrice || 0).toString(),
        taxRate: "18",
        taxAmount: ((transaction.servicePrice || 0) * 0.18).toFixed(2),
        displayOrder: 1
      }]);
    } else if (transaction.type === 'auction') {
      setInvoiceData({
        ...invoiceData,
        customerName: "Customer",
        customerEmail: transaction.customerEmail || "",
      });
      
      setItems([{
        description: `${transaction.carMake} ${transaction.carModel} ${transaction.carYear}`,
        quantity: "1",
        unitPrice: (transaction.bidAmount || 0).toString(),
        amount: (transaction.bidAmount || 0).toString(),
        taxRate: "18",
        taxAmount: ((transaction.bidAmount || 0) * 0.18).toFixed(2),
        displayOrder: 1
      }]);
    }
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequestJson("POST", "/api/admin/invoices", data);
    },
    onSuccess: () => {
      toast({
        title: "Invoice Created",
        description: "Invoice has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      setActiveTab("list");
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return apiRequestJson("POST", `/api/admin/invoices/${invoiceId}/send`, {});
    },
    onSuccess: () => {
      toast({
        title: "Invoice Sent",
        description: "Invoice has been sent to customer's email.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setInvoiceData({
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerAddress: "",
      customerCity: "",
      customerState: "Gujarat",
      customerZipCode: "",
      customerGSTIN: "",
      businessState: "Gujarat",
      businessGSTIN: "",
      notes: "",
      termsAndConditions: "Payment due within 30 days"
    });
    setItems([{
      description: "",
      quantity: "1",
      unitPrice: "0",
      amount: "0",
      taxRate: "18",
      taxAmount: "0",
      displayOrder: 1
    }]);
    setSelectedTransaction(null);
  };

  const handleCreateInvoice = () => {
    const totals = calculateTotals();
    
    const invoice = {
      ...invoiceData,
      subtotal: totals.subtotal,
      cgstAmount: totals.cgst,
      sgstAmount: totals.sgst,
      igstAmount: totals.igst,
      totalAmount: totals.total,
      businessName: "Ronak Motor Garage",
      status: "unpaid"
    };

    createInvoiceMutation.mutate({ invoice, items });
  };

  const totals = calculateTotals();

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>You must be an admin to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Invoice Management</h1>
          <p className="text-muted-foreground">Create and manage invoices with Indian GST</p>
        </div>
        <Link href="/admin">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="list">Invoices</TabsTrigger>
          <TabsTrigger value="create">Create Invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {loadingInvoices ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : invoices?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No invoices created yet</p>
                <Button onClick={() => setActiveTab("create")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Invoice
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {invoices?.map((invoice: Invoice) => (
                <Card key={invoice.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-xl">{invoice.invoiceNumber}</CardTitle>
                      <CardDescription>{invoice.customerName}</CardDescription>
                    </div>
                    <Badge variant={
                      invoice.status === 'paid' ? 'default' : 
                      invoice.status === 'unpaid' ? 'secondary' : 
                      'destructive'
                    }>
                      {invoice.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Amount</p>
                        <p className="text-2xl font-bold">₹{invoice.totalAmount}</p>
                      </div>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Eye className="mr-2 h-4 w-4" />
                              Preview
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Invoice {invoice.invoiceNumber}</DialogTitle>
                              <DialogDescription>Preview of the invoice</DialogDescription>
                            </DialogHeader>
                            <div className="border rounded-lg p-6">
                              <div className="mb-4">
                                <h3 className="font-semibold">Bill To:</h3>
                                <p>{invoice.customerName}</p>
                                {invoice.customerEmail && <p className="text-sm text-muted-foreground">{invoice.customerEmail}</p>}
                              </div>
                              <div className="border-t pt-4">
                                <h3 className="font-semibold mb-2">Items:</h3>
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2">Description</th>
                                      <th className="text-right py-2">Qty</th>
                                      <th className="text-right py-2">Rate</th>
                                      <th className="text-right py-2">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoice.items.map((item, idx) => (
                                      <tr key={idx} className="border-b">
                                        <td className="py-2">{item.description}</td>
                                        <td className="text-right">{item.quantity}</td>
                                        <td className="text-right">₹{item.unitPrice}</td>
                                        <td className="text-right">₹{item.amount}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div className="mt-4 text-right space-y-1">
                                  <p><span className="font-semibold">Subtotal:</span> ₹{invoice.subtotal}</p>
                                  {parseFloat(invoice.cgstAmount) > 0 && <p><span className="font-semibold">CGST:</span> ₹{invoice.cgstAmount}</p>}
                                  {parseFloat(invoice.sgstAmount) > 0 && <p><span className="font-semibold">SGST:</span> ₹{invoice.sgstAmount}</p>}
                                  {parseFloat(invoice.igstAmount) > 0 && <p><span className="font-semibold">IGST:</span> ₹{invoice.igstAmount}</p>}
                                  <p className="text-xl"><span className="font-bold">Total:</span> ₹{invoice.totalAmount}</p>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        {invoice.customerEmail && (
                          <Button 
                            size="sm"
                            onClick={() => sendInvoiceMutation.mutate(invoice.id)}
                            disabled={sendInvoiceMutation.isPending}
                          >
                            {sendInvoiceMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            Send
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create">
          <div className="grid gap-6">
            {eligibleTransactions && (eligibleTransactions.appointments?.length > 0 || eligibleTransactions.bids?.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Load from Transaction</CardTitle>
                  <CardDescription>Select a completed service or won auction to auto-populate invoice</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {eligibleTransactions.appointments?.map((apt: any) => (
                      <Button
                        key={apt.id}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => loadTransactionData(apt)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {apt.serviceName} - {apt.customerName} - ₹{apt.servicePrice}
                      </Button>
                    ))}
                    {eligibleTransactions.bids?.map((bid: any) => (
                      <Button
                        key={bid.id}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => loadTransactionData(bid)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Auction: {bid.carMake} {bid.carModel} - ₹{bid.bidAmount}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer Name *</Label>
                    <Input
                      value={invoiceData.customerName}
                      onChange={(e) => setInvoiceData({ ...invoiceData, customerName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={invoiceData.customerEmail}
                      onChange={(e) => setInvoiceData({ ...invoiceData, customerEmail: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer State *</Label>
                    <Select value={invoiceData.customerState} onValueChange={(value) => setInvoiceData({ ...invoiceData, customerState: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Gujarat">Gujarat</SelectItem>
                        <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                        <SelectItem value="Delhi">Delhi</SelectItem>
                        <SelectItem value="Karnataka">Karnataka</SelectItem>
                        <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>GSTIN (Optional)</Label>
                    <Input
                      value={invoiceData.customerGSTIN}
                      onChange={(e) => setInvoiceData({ ...invoiceData, customerGSTIN: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoice Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <h4 className="font-semibold">Item {index + 1}</h4>
                      {items.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Description *</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Quantity *</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Unit Price (₹) *</Label>
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Tax Rate (%)</Label>
                        <Input
                          type="number"
                          value={item.taxRate}
                          onChange={(e) => updateItem(index, "taxRate", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Amount (₹)</Label>
                        <Input value={item.amount} disabled />
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addItem} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold">₹{totals.subtotal}</span>
                  </div>
                  {parseFloat(totals.cgst) > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>CGST (Intra-state):</span>
                        <span>₹{totals.cgst}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>SGST (Intra-state):</span>
                        <span>₹{totals.sgst}</span>
                      </div>
                    </>
                  )}
                  {parseFloat(totals.igst) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>IGST (Inter-state):</span>
                      <span>₹{totals.igst}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold pt-2 border-t">
                    <span>Total:</span>
                    <span>₹{totals.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={invoiceData.notes}
                    onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                    placeholder="Any additional notes for the customer"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button onClick={resetForm} variant="outline" className="flex-1">
                Reset
              </Button>
              <Button 
                onClick={handleCreateInvoice} 
                className="flex-1"
                disabled={createInvoiceMutation.isPending || !invoiceData.customerName}
              >
                {createInvoiceMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Invoice
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
