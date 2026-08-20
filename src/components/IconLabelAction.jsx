import clsx from 'clsx';
import { Link } from 'react-router-dom';

export default function IconLabelAction({ icon, label, tone = 'neutral', to, type = 'button', className = '', ...props }) {
  const classes = clsx('ll-icon-label-action', className);
  const content = <><span aria-hidden="true">{icon}</span><small>{label}</small></>;

  if (to) return <Link to={to} className={classes} data-tone={tone} aria-label={label} {...props}>{content}</Link>;
  return <button type={type} className={classes} data-tone={tone} aria-label={label} {...props}>{content}</button>;
}
