import {
  Children, Fragment, cloneElement, isValidElement,
  type HTMLAttributes, type ReactNode,
  type TdHTMLAttributes, type ThHTMLAttributes,
} from "react";

function hasControls(node: ReactNode): boolean {
  return Children.toArray(node).some((child) => {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) return false;
    if (child.type === Fragment) return hasControls(child.props.children);
    if (typeof child.type !== "string") return true;
    // These actions display the record's text and belong to its single text block.
    if ((child.type === "button" || child.type === "a")
      && /(?:^|\s)(?:board-assignment-link|equipment-detail-trigger)(?:\s|$)/u.test(child.props.className ?? "")) {
      return hasControls(child.props.children);
    }
    return ["input", "textarea", "select", "button", "a", "details", "table", "label"].includes(child.type)
      || hasControls(child.props.children);
  });
}

function CellContent({ children }: { children: ReactNode }) {
  const result: ReactNode[] = [];
  let text: ReactNode[] = [];
  function flushText() {
    if (text.length === 0) return;
    result.push(<span className="table-cell-text" key={`text-${result.length}`}>{text}</span>);
    text = [];
  }
  for (const child of Children.toArray(children)) {
    if (!hasControls(child)) { text.push(child); continue; }
    flushText();
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === Fragment) {
      result.push(<CellContent key={`fragment-${result.length}`}>{child.props.children}</CellContent>);
    } else if (typeof child.type !== "string"
      || ["input", "textarea", "select", "table", "details", "label"].includes(child.type)) {
      result.push(child);
    } else {
      result.push(cloneElement(child, undefined, <CellContent>{child.props.children}</CellContent>));
    }
  }
  flushText();
  return result;
}

export function TableCell({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props}><CellContent>{children}</CellContent></td>;
}

export function TableHeader({ children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props}><CellContent>{children}</CellContent></th>;
}

export function AriaTableCell({ children, as: Tag = "span", ...props }: HTMLAttributes<HTMLElement> & {
  as?: "span" | "div" | "time";
  dateTime?: string;
}) {
  return <Tag {...props}><CellContent>{children}</CellContent></Tag>;
}
