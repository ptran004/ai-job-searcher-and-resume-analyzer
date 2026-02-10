import { Link } from "react-router";

const Navbar = () => {
    return (
        <nav className="navbar">
            <Link to="/">
                <p className="text-2xl font-bold text-gradient">SAFFRON</p>
            </Link>

            <div className="flex gap-3">
                {/* Link to static HTML file */}
                <a href="/job_search.html" className="primary-button w-fit">
                    Job Search
                </a>

                {/* React Router route */}
                <Link to="/upload" className="primary-button w-fit">
                    Upload Resume
                </Link>

                <a href="/job_tracker.html" className="primary-button w-fit">
                    Job Tracker
                </a>
            </div>
        </nav>
    );
};

export default Navbar;
