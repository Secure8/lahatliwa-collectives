import ProjectCard from './ProjectCard';

export default function ProjectGrid({ projects, variant = 'standard' }) {
  if (variant === 'editorial') {
    return (
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => (
          <ProjectCard key={project.id} project={project} variant="editorial" index={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
