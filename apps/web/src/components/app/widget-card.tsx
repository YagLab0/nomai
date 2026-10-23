import { Card } from '@heroui/react';

export function WidgetCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 border border-sand bg-white p-4 shadow-none">
      <Card.Header className="flex-row items-center justify-between gap-2">
        <Card.Title className="font-brand text-base font-medium text-ink">{title}</Card.Title>
        {action}
      </Card.Header>
      <Card.Content className="gap-3">{children}</Card.Content>
    </Card>
  );
}
