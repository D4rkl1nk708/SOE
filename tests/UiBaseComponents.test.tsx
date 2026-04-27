import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Polyfill ResizeObserver and scrollIntoView for JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock useEmblaCarousel
vi.mock("embla-carousel-react", () => ({
  default: () => [
    vi.fn(),
    {
      canScrollPrev: () => false,
      canScrollNext: () => true,
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
  ],
}));

// Mock ResponsiveContainer for Chart
vi.mock("recharts", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

describe("UI Basic Components Coverage", () => {
  test("Checkbox renders and toggles", () => {
    const onChange = vi.fn();
    render(<Checkbox onCheckedChange={onChange} data-testid="checkbox" />);
    const checkbox = screen.getByTestId("checkbox");
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
  });

  test("Collapsible renders and expands", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText("Toggle")).toBeTruthy();
  });

  test("Carousel basic structure", () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByRole("region")).toBeTruthy();
  });

  test("Chart components structure", () => {
    const config = {
      views: { label: "Views", color: "blue" },
    };
    render(
      <ChartContainer config={config} className="h-[200px]">
        <div data-testid="chart-child" />
      </ChartContainer>,
    );
    expect(screen.getByTestId("chart-child")).toBeTruthy();

    // Test ChartTooltipContent
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent
          active
          payload={[
            {
              name: "views",
              value: 10,
              dataKey: "views",
              payload: { fill: "blue" },
            },
          ]}
        />
      </ChartContainer>,
    );
    expect(screen.getAllByText("Views").length).toBeGreaterThan(0);
    expect(screen.getByText("10")).toBeTruthy();
  });

  test("Command palette structure", () => {
    render(
      <>
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup heading="Group">
              <CommandItem>
                Item 1 <CommandShortcut>⌘A</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </CommandList>
        </Command>
        <CommandDialog open>
          <div>Dialog content</div>
        </CommandDialog>
      </>,
    );
    expect(screen.getByPlaceholderText("Search...")).toBeTruthy();
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Dialog content")).toBeTruthy();
  });

  test("ContextMenu structure", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Edit</ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Option 1</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuCheckboxItem checked>Check</ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="a">
            <ContextMenuRadioItem value="a">Radio A</ContextMenuRadioItem>
            <ContextMenuRadioItem value="b">Radio B</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuLabel inset>Label</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuShortcut>Ctrl+E</ContextMenuShortcut>
        </ContextMenuContent>
      </ContextMenu>,
    );
    const trigger = screen.getByText("Right click me");
    fireEvent.contextMenu(trigger);

    // In JSDOM with Radix, we might just check if the content is in the body
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Check")).toBeTruthy();
  });

  test("Chart Legend and indicators", () => {
    const config = { v1: { label: "V1", color: "red" } };
    render(
      <ChartContainer config={config}>
        <ChartLegendContent
          payload={[{ value: "v1", color: "red", type: "line", dataKey: "v1" }]}
        />
        <ChartTooltipContent
          active
          indicator="line"
          payload={[
            { name: "v1", value: 5, dataKey: "v1", payload: { fill: "red" } },
          ]}
        />
      </ChartContainer>,
    );
    expect(screen.getAllByText("V1").length).toBeGreaterThan(0);
    expect(screen.getByText("5")).toBeTruthy();
  });

  test("Basic UI Components batch", () => {
    render(
      <>
        <Badge>Badge</Badge>
        <Button>Button</Button>
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <Input placeholder="Input" />
        <Label>Label</Label>
        <Progress value={50} />
        <Separator />
        <Skeleton />
        <Switch />
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Content</TabsContent>
        </Tabs>
      </>,
    );
    expect(screen.getByText("Badge")).toBeTruthy();
    expect(screen.getByPlaceholderText("Input")).toBeTruthy();
  });
});
