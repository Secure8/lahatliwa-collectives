import ProjectCard from './ProjectCard';
import clsx from 'clsx';

export default function ProjectGrid({ projects, className = '', containerRef, scrollRestorationId }) {
  return (
    <div ref={containerRef} data-scroll-restoration-id={scrollRestorationId} className={clsx('grid items-stretch gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  );
}
