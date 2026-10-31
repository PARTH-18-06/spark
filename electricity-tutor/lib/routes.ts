import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  House,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const studentNavigation: NavigationItem[] = [
  { label: "Learn", href: "/learn", icon: House },
  { label: "Concepts", href: "/learn/concepts", icon: BookOpen },
  { label: "Revision", href: "/learn/revision", icon: RotateCcw },
  {
    label: "Progress",
    href: "/learn/progress",
    icon: ChartNoAxesColumnIncreasing,
  },
];
