type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>> & {
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { style, dataset, ...rest } = props;
  Object.assign(element, rest);
  if (style) Object.assign(element.style, style);
  if (dataset) Object.assign(element.dataset, dataset);
  for (const child of children) {
    if (child !== null && child !== undefined) element.append(child);
  }
  return element;
}

export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setVisible(element: HTMLElement, visible: boolean): void {
  element.hidden = !visible;
}
