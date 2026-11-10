import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PackageSearch } from 'lucide-react'
import { useOrderStore } from '@/stores/shop'
import { LoaderScreen } from '@/components/LoaderScreen'
import { CancelOrderDialog, ReturnRequestDialog } from '@/components/order-dialogs'
import { toast } from 'sonner'

// Renders real backend orders only — no demo/showcase data.
export function OrderHistory1({ orders: orderDocs, loading }) {
  const navigate = useNavigate();
  const cancelOrder = useOrderStore((s) => s.cancel);
  const requestReturn = useOrderStore((s) => s.requestReturn);
  const [actingId, setActingId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);

  const hasServerOrders = Array.isArray(orderDocs) && orderDocs.length > 0;

  const confirmCancel = async ({ reason, detail }) => {
    if (!cancelTarget) return;
    const id = cancelTarget.id ?? cancelTarget._id;
    setActingId(id);
    try {
      await cancelOrder(id, reason, detail);
      toast.success("Cancellation requested — pending admin review");
      setCancelTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.error ?? "Failed to request cancellation");
    } finally {
      setActingId(null);
    }
  };

  const confirmReturn = async ({ reason, detail }) => {
    if (!returnTarget) return;
    const id = returnTarget.id ?? returnTarget._id;
    setActingId(id);
    try {
      await requestReturn(id, reason, detail);
      toast.success("Return requested — pending admin review");
      setReturnTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.error ?? "Failed to request return");
    } finally {
      setActingId(null);
    }
  };

  if (!hasServerOrders && !loading) {
    return (
      <div className='mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8'>
        <Card>
          <CardHeader>
            <CardTitle className='text-2xl'>Order History</CardTitle>
            <CardDescription className='text-balance'>View your past orders and their status</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col items-center gap-4 py-14 text-center'>
            <span className='flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
              <PackageSearch className='h-8 w-8 text-muted-foreground' />
            </span>
            <div>
              <p className='text-lg font-semibold'>No orders yet</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                Your real orders will appear here once you check out.
              </p>
            </div>
            <Button onClick={() => navigate('/search')}>
              Start Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading && !hasServerOrders) {
    return <LoaderScreen />;
  }

  const orders = orderDocs ?? [];
  const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);

  return (
    <div className='mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8'>
      <Card>
        <CardHeader className='flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-x-6'>
          <div>
            <CardTitle className='text-2xl'>Order History</CardTitle>
            <CardDescription className='text-balance'>View your past orders and their status</CardDescription>
          </div>
          <div className='text-muted-foreground text-end text-sm max-sm:text-start'>
            <p>Total Orders: {orders.length}</p>
            <p>Total Spent: ₹{totalAmount.toFixed(2)}</p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead className='font-semibold'>Order</TableHead>
                <TableHead className='hidden sm:table-cell text-end font-semibold'>Date</TableHead>
                <TableHead className='hidden md:table-cell text-end font-semibold'>Status</TableHead>
                <TableHead className='text-end font-semibold'>Total</TableHead>
                <TableHead className='text-end font-semibold'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id ?? order._id}>
                  <TableCell className='flex flex-col sm:flex-row sm:items-center gap-3 py-3'>
                    {(order.products?.[0]?.thumbnail) && (
                      <img
                        src={order.products[0].thumbnail}
                        alt={order.products[0].title ?? 'Product'}
                        className='w-16 h-16 rounded-md object-cover shrink-0'
                      />
                    )}
                    <div className='flex-1 min-w-0'>
                      <p className='font-medium truncate'>{order.id ?? order._id}</p>
                      <p className='text-muted-foreground text-sm truncate'>
                        {(order.products ?? []).length} item(s)
                        {order.products?.[0]?.title ? ` • ${order.products[0].title}` : ''}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className='hidden sm:table-cell text-end'>
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className='hidden md:table-cell text-end'>
                    <div className='flex flex-col items-end gap-1'>
                      <Badge variant='secondary'>{order.status ?? 'pending'}</Badge>
                      {(() => {
                        // List items are raw order docs (no .raw wrapper);
                        // detail views may nest under .raw. Support both.
                        const src = order.raw ?? order;
                        return (<>
                          {src?.cancellation?.status && src.cancellation.status !== 'none' && (
                            <Badge variant='outline' className='text-[10px]'>
                              Cancel: {src.cancellation.status}
                            </Badge>
                          )}
                          {src?.return?.status && src.return.status !== 'none' && (
                            <Badge variant='outline' className='text-[10px]'>
                              Return: {src.return.status}
                            </Badge>
                          )}
                        </>);
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className='text-end'>₹{(order.totalAmount ?? 0).toFixed(2)}</TableCell>
                  <TableCell className='text-end'>
                    <div className='flex justify-end gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => navigate(`/order-status?id=${order.id ?? order._id}`)}
                      >
                        Track
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={actingId === (order.id ?? order._id)}
                        onClick={() => setCancelTarget(order)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={actingId === (order.id ?? order._id)}
                        onClick={() => setReturnTarget(order)}
                      >
                        Return
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className='bg-transparent'>
              <TableRow className='font-semibold hover:bg-transparent'>
                <TableCell colSpan={3}></TableCell>
                <TableCell className='text-end'>{`₹${totalAmount.toFixed(2)}`}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
      <CancelOrderDialog
        order={cancelTarget}
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        busy={Boolean(actingId)}
      />
      <ReturnRequestDialog
        order={returnTarget}
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        onConfirm={confirmReturn}
        busy={Boolean(actingId)}
      />
    </div>
  )
}

export default OrderHistory1
