import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Form } from "react-router";

function snapshot(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form)].sort(([a], [b]) => a.localeCompare(b)),
  );
}

type Props = Omit<
  ComponentProps<typeof Form>,
  "children" | "ref" | "onSubmit"
> & {
  savedAction?: object;
  children: ReactNode;
  actions: (changed: boolean) => ReactNode;
};

export default function TrackedSettingsForm({
  savedAction,
  children,
  actions,
  ...props
}: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const saved = useRef<string>(null);
  const submitted = useRef<string>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    saved.current = snapshot(form);
    const update = () => setChanged(snapshot(form) !== saved.current);

    // Picks from the entity menu update a hidden input without a native input event.
    const observer = new MutationObserver(update);
    observer.observe(form, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["name", "value", "disabled", "checked"],
    });
    form.addEventListener("input", update);
    form.addEventListener("change", update);

    return () => {
      observer.disconnect();
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!savedAction || !ref.current) return;
    const current = snapshot(ref.current);
    saved.current = submitted.current ?? current;
    submitted.current = null;
    setChanged(current !== saved.current);
  }, [savedAction]);

  return (
    <Form
      {...props}
      ref={ref}
      onSubmit={(event) => {
        const current = snapshot(event.currentTarget);
        if (current === saved.current) event.preventDefault();
        else submitted.current = current;
      }}
    >
      {children}
      {actions(changed)}
    </Form>
  );
}
