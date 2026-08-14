import ProjectCard from './ProjectCard';
import clsx from 'clsx';

export default function ProjectGrid({ projects, className = '', containerRef, scrollRestorationId }) {
  return (
    <div ref={containerRef} data-scroll-restoration-id={scrollRestorationId} className={clsx('ll-portfolio-grid', className)}>
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  );
}
