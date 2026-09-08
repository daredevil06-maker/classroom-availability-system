import { useEffect, useState } from "react";
import HodDashboard from "./HodDashboard";

function AdminDashboard({ user, onLogout }) {

    const [priorities, setPriorities] = useState([]);
    const [classrooms, setClassrooms] = useState([]);
    const [message, setMessage] = useState("");
    const [activeTab, setActiveTab] = useState("priorities");

    const [showClassroomForm, setShowClassroomForm] = useState(false);
    const [editingClassroom, setEditingClassroom] = useState(null);

    const [roomNumber, setRoomNumber] = useState("");
    const [building, setBuilding] = useState("");
    const [roomType, setRoomType] = useState("CLASSROOM");
    const [capacity, setCapacity] = useState("");
    const [ac, setAc] = useState(false);
    const [computers, setComputers] = useState(false);
    const [audioSystem, setAudioSystem] = useState(false);
    const [status, setStatus] = useState("AVAILABLE");

    const [timetable, setTimetable] = useState([]);
    const [teachers, setTeachers] = useState([]);

    const [showTimetableForm, setShowTimetableForm] = useState(false);
    const [editingTimetable, setEditingTimetable] = useState(null);

    const [timetableTeacher, setTimetableTeacher] = useState("");
    const [timetableClassroom, setTimetableClassroom] = useState("");
    const [subject, setSubject] = useState("");
    const [dayOfWeek, setDayOfWeek] = useState("Monday");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [scheduleType, setScheduleType] = useState("THEORY");
    const [slotCode, setSlotCode] = useState("");

    const loadPriorities = async () => {

        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:5000/api/admin/priorities",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setPriorities(data.priorities);

        } catch (error) {
            setMessage("Unable to load priorities");
        }
    };

    const loadClassrooms = async () => {
        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:5000/api/admin/classrooms",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setClassrooms(data.classrooms);

        } catch (error) {

            console.error("Classroom fetch error:", error);
            setMessage("Unable to load classrooms");

        }
    };

    const loadTimetable = async () => {

    try {

        const token = localStorage.getItem("token");

        const response = await fetch(
            "http://localhost:5000/api/admin/timetable",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            setMessage(data.message);
            return;
        }

        setTimetable(data.timetable);

    } catch (error) {

        console.error("Timetable fetch error:", error);
        setMessage("Unable to load timetable");

    }
};


const loadTeachers = async () => {

    try {

        const token = localStorage.getItem("token");

        const response = await fetch(
            "http://localhost:5000/api/admin/teachers",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            setMessage(data.message);
            return;
        }

        setTeachers(data.teachers);

    } catch (error) {

        console.error("Teacher fetch error:", error);
        setMessage("Unable to load teachers");

    }
};


    useEffect(() => {
        loadPriorities();
        loadClassrooms();
        loadTimetable();
        loadTeachers();
    }, []);


    const updatePriority = async (priorityId, value) => {
            try {
                const token = localStorage.getItem("token");

                const response = await fetch(
                    `http://localhost:5000/api/admin/priorities/${priorityId}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            priority: Number(value)
                        })
                    }
                );

                const data = await response.json();

                console.log("Priority update response:", data);

                if (!response.ok) {
                    setMessage(`Error: ${data.message}`);
                    return;
                }

                setMessage(
                    `${data.priority.activity_type} priority updated to ${data.priority.priority}`
                );

                // Reload values from database
                await loadPriorities();

            } catch (error) {
                console.error("Priority update error:", error);
                setMessage("Unable to update priority");
            }
        };

        const saveClassroom = async () => {

        if (
            !roomNumber ||
            !building ||
            !roomType ||
            !capacity
        ) {
            setMessage("Please fill all required classroom fields");
            return;
        }

        try {

            const token = localStorage.getItem("token");

            const classroomData = {
                room_number: roomNumber,
                building: building,
                room_type: roomType,
                capacity: Number(capacity),
                ac: ac,
                computers: computers,
                audio_system: audioSystem,
                status: status
            };

            const url = editingClassroom
                ? `http://localhost:5000/api/admin/classrooms/${editingClassroom.classroom_id}`
                : "http://localhost:5000/api/admin/classrooms";

            const response = await fetch(url, {
                method: editingClassroom ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(classroomData)
            });

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setMessage(
                editingClassroom
                    ? "Classroom updated successfully"
                    : "Classroom added successfully"
            );

            resetClassroomForm();
            await loadClassrooms();

        } catch (error) {

            console.error("Classroom save error:", error);
            setMessage("Unable to save classroom");

        }
    };

    const resetClassroomForm = () => {

        setRoomNumber("");
        setBuilding("");
        setRoomType("CLASSROOM");
        setCapacity("");
        setAc(false);
        setComputers(false);
        setAudioSystem(false);
        setStatus("AVAILABLE");

        setEditingClassroom(null);
        setShowClassroomForm(false);
    };


    const editClassroom = (room) => {

        setEditingClassroom(room);

        setRoomNumber(room.room_number);
        setBuilding(room.building);
        setRoomType(room.room_type);
        setCapacity(room.capacity);
        setAc(room.ac);
        setComputers(room.computers);
        setAudioSystem(room.audio_system);
        setStatus(room.status);

        setShowClassroomForm(true);
    };

    const saveTimetable = async () => {

    if (
        !timetableTeacher ||
        !timetableClassroom ||
        !subject ||
        !dayOfWeek ||
        !startTime ||
        !endTime ||
        !scheduleType ||
        !slotCode
    ) {
        setMessage("Please fill all timetable fields");
        return;
    }


    if (startTime >= endTime) {
        setMessage("Start time must be before end time");
        return;
    }


    try {

        const token = localStorage.getItem("token");

        const timetableData = {
            teacher_id: Number(timetableTeacher),
            classroom_id: Number(timetableClassroom),
            subject: subject,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime,
            schedule_type: scheduleType,
            slot_code: slotCode
        };


        const url = editingTimetable
            ? `http://localhost:5000/api/admin/timetable/${editingTimetable.timetable_id}`
            : "http://localhost:5000/api/admin/timetable";


        const response = await fetch(url, {
            method: editingTimetable ? "PUT" : "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(timetableData)
        });


        const data = await response.json();


        if (!response.ok) {
            setMessage(data.message);
            return;
        }


        setMessage(
            editingTimetable
                ? "Timetable updated successfully"
                : "Timetable entry added successfully"
        );


        resetTimetableForm();

        await loadTimetable();

    } catch (error) {

        console.error("Timetable save error:", error);
        setMessage("Unable to save timetable");

    }
};

const resetTimetableForm = () => {

    setTimetableTeacher("");
    setTimetableClassroom("");
    setSubject("");
    setDayOfWeek("Monday");
    setStartTime("");
    setEndTime("");
    setScheduleType("THEORY");
    setSlotCode("");

    setEditingTimetable(null);
    setShowTimetableForm(false);
};


const editTimetable = (item) => {

    setEditingTimetable(item);

    setTimetableTeacher(String(item.teacher_id));
    setTimetableClassroom(String(item.classroom_id));
    setSubject(item.subject);
    setDayOfWeek(item.day_of_week);
    setStartTime(String(item.start_time).slice(0, 5));
    setEndTime(String(item.end_time).slice(0, 5));
    setScheduleType(item.schedule_type);
    setSlotCode(item.slot_code);

    setShowTimetableForm(true);
};


    return (
        <div className="min-h-screen bg-gray-100">

            <nav className="bg-blue-600 text-white px-8 py-4 flex justify-between items-center">

                <h1 className="text-xl font-bold">
                    Classroom Allocation System
                </h1>

                <div className="flex items-center gap-4">

                    <span>
                        {user.name}
                    </span>

                    <button
                        onClick={onLogout}
                        className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold"
                    >
                        Logout
                    </button>

                </div>

            </nav>


            <main className="max-w-7xl mx-auto p-8">

                <h2 className="text-3xl font-bold">
                    Admin Dashboard
                </h2>

                <p className="text-gray-600 mt-1 mb-8">
                    Manage classroom activity priorities, timetables, and override faculty allocations
                </p>
                {/* ADMIN TABS */}
            <div className="flex flex-wrap gap-2 mb-6 bg-white p-2 rounded-xl shadow">

                <button
                    onClick={() => setActiveTab("priorities")}
                    className={
                        activeTab === "priorities"
                            ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                            : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                    }
                >
                    Activity Priorities
                </button>

                <button
                    onClick={() => setActiveTab("classrooms")}
                    className={
                        activeTab === "classrooms"
                            ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                            : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                    }
                >
                    Classrooms
                </button>

                <button
                    onClick={() => setActiveTab("timetable")}
                    className={
                        activeTab === "timetable"
                            ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                            : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                    }
                >
                    Timetable
                </button>

                <button
                    onClick={() => setActiveTab("allocations")}
                    className={
                        activeTab === "allocations"
                            ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                            : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                    }
                >
                    Allocations & Reassignments (HOD Override)
                </button>

            </div>


                {activeTab === "priorities" && (
                <div className="bg-white rounded-xl shadow p-6">

                    <h3 className="text-2xl font-bold mb-2">
                        Activity Priorities
                    </h3>

                    <p className="text-gray-500 mb-6">
                        Higher priority activities receive preference during classroom conflicts.
                    </p>


                    <div className="space-y-4">

                        {priorities.map((item) => (

                            <div
                                key={item.priority_id}
                                className="flex items-center justify-between border rounded-lg p-4"
                            >

                                <div>

                                    <p className="font-semibold text-lg">
                                        {item.activity_type}
                                    </p>

                                    <p className="text-gray-500 text-sm">
                                        Priority ID: {item.priority_id}
                                    </p>

                                </div>
                            

                                <div className="flex items-center gap-3">

                                    <input
                                        type="number"
                                        min="0"
                                        value={item.priority}
                                        onChange={(e) => {

                                            const value = e.target.value;

                                            setPriorities((prev) =>
                                                prev.map((priority) =>
                                                    priority.priority_id === item.priority_id
                                                        ? {
                                                            ...priority,
                                                            priority: value
                                                        }
                                                        : priority
                                                )
                                            );

                                        }}
                                        className="w-24 border rounded-lg px-3 py-2 text-center"
                                    />


                                    <button
                                        onClick={() =>
                                            updatePriority(
                                                item.priority_id,
                                                item.priority
                                            )
                                        }
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold"
                                    >
                                        Save
                                    </button>

                                </div>

                            </div>

                        
                        ))}
                        
                    </div>
                    {message && (
                            <div className="mt-5 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-blue-700 font-medium">
                                    {message}
                                </p>
                            </div>
                        )}

                </div>

                )}

                {/* CLASSROOM MANAGEMENT */}
{activeTab === "classrooms" && (
    <div className="mt-8 bg-white rounded-xl shadow p-6">

    <div className="flex justify-between items-center mb-6">

        <div>
            <h3 className="text-2xl font-bold">
                Classroom Management
            </h3>

            <p className="text-gray-500">
                Add, view and edit classrooms and their resources.
            </p>
        </div>

        <button
            onClick={() => {
                resetClassroomForm();
                setShowClassroomForm(true);
            }}
            className="bg-green-600 text-white px-5 py-2 rounded-lg font-semibold"
        >
            + Add Classroom
        </button>

    </div>


    {/* CLASSROOM FORM */}
    {showClassroomForm && (

        <div className="border rounded-xl p-5 mb-6 bg-gray-50">

            <h4 className="text-xl font-bold mb-5">
                {editingClassroom
                    ? "Edit Classroom"
                    : "Add Classroom"}
            </h4>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div>
                    <label className="block font-medium mb-2">
                        Room Number
                    </label>

                    <input
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        placeholder="Example: 101"
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>


                <div>
                    <label className="block font-medium mb-2">
                        Building
                    </label>

                    <input
                        value={building}
                        onChange={(e) => setBuilding(e.target.value)}
                        placeholder="Example: SJT"
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>


                <div>
                    <label className="block font-medium mb-2">
                        Room Type
                    </label>

                    <select
                        value={roomType}
                        onChange={(e) => setRoomType(e.target.value)}
                        className="w-full border rounded-lg px-4 py-2"
                    >
                        <option value="CLASSROOM">
                            Classroom
                        </option>

                        <option value="SMART_CLASSROOM">
                            Smart Classroom
                        </option>

                        <option value="COMPUTER_LAB">
                            Computer Lab
                        </option>

                        <option value="SPECIALIZED_LAB">
                            Specialized Lab
                        </option>

                        <option value="AUDITORIUM">
                            Auditorium
                        </option>
                    </select>
                </div>


                <div>
                    <label className="block font-medium mb-2">
                        Capacity
                    </label>

                    <input
                        type="number"
                        min="1"
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        placeholder="Example: 70"
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>

            </div>


            {/* FEATURES */}
            <div className="mt-5">

                <p className="font-medium mb-3">
                    Resources
                </p>

                <div className="flex flex-wrap gap-5">

                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={ac}
                            onChange={(e) => setAc(e.target.checked)}
                        />
                        AC
                    </label>


                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={computers}
                            onChange={(e) => setComputers(e.target.checked)}
                        />
                        Computers
                    </label>


                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={audioSystem}
                            onChange={(e) => setAudioSystem(e.target.checked)}
                        />
                        Audio System
                    </label>

                </div>

            </div>


            {/* STATUS */}
            <div className="mt-5">

                <label className="block font-medium mb-2">
                    Status
                </label>

                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border rounded-lg px-4 py-2"
                >
                    <option value="AVAILABLE">
                        AVAILABLE
                    </option>

                    <option value="MAINTENANCE">
                        MAINTENANCE
                    </option>

                    <option value="UNAVAILABLE">
                        UNAVAILABLE
                    </option>
                </select>

            </div>


            {/* FORM BUTTONS */}
            <div className="flex gap-3 mt-6">

                <button
                    onClick={saveClassroom}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                >
                    {editingClassroom
                        ? "Update Classroom"
                        : "Add Classroom"}
                </button>

                <button
                    onClick={resetClassroomForm}
                    className="bg-gray-300 px-5 py-2 rounded-lg font-semibold"
                >
                    Cancel
                </button>

            </div>

        </div>

    )}


    {/* CLASSROOM LIST */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {classrooms.map((room) => (

            <div
                key={room.classroom_id}
                className="border rounded-xl p-5"
            >

                            <div className="flex justify-between items-start">

                                <div>

                                    <h4 className="text-xl font-bold">
                                        {room.building} {room.room_number}
                                    </h4>

                                    <p className="text-gray-500">
                                        {room.room_type}
                                    </p>

                                </div>

                                <span
                                    className={
                                        room.status === "AVAILABLE"
                                            ? "text-green-600 font-semibold"
                                            : "text-red-600 font-semibold"
                                    }
                                >
                                    {room.status}
                                </span>

                            </div>


                            <div className="grid grid-cols-2 gap-3 mt-4 text-gray-600">

                                <p>
                                    <strong>Capacity:</strong><br />
                                    {room.capacity}
                                </p>

                                <p>
                                    <strong>AC:</strong><br />
                                    {room.ac ? "Yes" : "No"}
                                </p>

                                <p>
                                    <strong>Computers:</strong><br />
                                    {room.computers ? "Yes" : "No"}
                                </p>

                                <p>
                                    <strong>Audio:</strong><br />
                                    {room.audio_system ? "Yes" : "No"}
                                </p>

                            </div>


                            <button
                                onClick={() => editClassroom(room)}
                                className="mt-5 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold"
                            >
                                Edit
                            </button>

                        </div>

                    ))}

                </div>

            </div>
)}
                    {/* TIMETABLE MANAGEMENT */}
{activeTab === "timetable" && (
    <div className="mt-8 bg-white rounded-xl shadow p-6">

    <div className="flex justify-between items-center mb-6">

        <div>
            <h3 className="text-2xl font-bold">
                Timetable Management
            </h3>

            <p className="text-gray-500">
                Manage regular theory and lab schedules.
            </p>
        </div>

        <div className="flex items-center gap-3">
            <input
                type="file"
                id="excel-timetable-input"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={() => {}}
            />
            <button
                type="button"
                onClick={() => {
                    document.getElementById("excel-timetable-input")?.click();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition shadow-sm"
                title="Upload Teacher Timetable (.xlsx / .xls)"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Upload Teacher Timetable (Excel)</span>
            </button>

            <button
                onClick={() => {
                    resetTimetableForm();
                    setShowTimetableForm(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-semibold transition"
            >
                + Add Timetable
            </button>
        </div>

    </div>


    {/* TIMETABLE FORM */}
    {showTimetableForm && (

        <div className="border rounded-xl p-5 mb-6 bg-gray-50">

            <h4 className="text-xl font-bold mb-5">
                {editingTimetable
                    ? "Edit Timetable Entry"
                    : "Add Timetable Entry"}
            </h4>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">


                {/* TEACHER */}
                <div>

                    <label className="block font-medium mb-2">
                        Teacher
                    </label>

                    <select
                        value={timetableTeacher}
                        onChange={(e) =>
                            setTimetableTeacher(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    >

                        <option value="">
                            Select Teacher
                        </option>

                        {teachers.map((teacher) => (

                            <option
                                key={teacher.teacher_id}
                                value={teacher.teacher_id}
                            >
                                {teacher.teacher_name} - {teacher.employee_id}
                            </option>

                        ))}

                    </select>

                </div>


                {/* CLASSROOM */}
                <div>

                    <label className="block font-medium mb-2">
                        Classroom
                    </label>

                    <select
                        value={timetableClassroom}
                        onChange={(e) =>
                            setTimetableClassroom(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    >

                        <option value="">
                            Select Classroom
                        </option>

                        {classrooms.map((room) => (

                            <option
                                key={room.classroom_id}
                                value={room.classroom_id}
                            >
                                {room.building} {room.room_number}
                            </option>

                        ))}

                    </select>

                </div>


                {/* SUBJECT */}
                <div>

                    <label className="block font-medium mb-2">
                        Subject
                    </label>

                    <input
                        value={subject}
                        onChange={(e) =>
                            setSubject(e.target.value)
                        }
                        placeholder="Example: Database Management Systems"
                        className="w-full border rounded-lg px-4 py-2"
                    />

                </div>


                {/* DAY */}
                <div>

                    <label className="block font-medium mb-2">
                        Day
                    </label>

                    <select
                        value={dayOfWeek}
                        onChange={(e) =>
                            setDayOfWeek(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    >

                        <option>Monday</option>
                        <option>Tuesday</option>
                        <option>Wednesday</option>
                        <option>Thursday</option>
                        <option>Friday</option>
                        <option>Saturday</option>

                    </select>

                </div>


                {/* START TIME */}
                <div>

                    <label className="block font-medium mb-2">
                        Start Time
                    </label>

                    <input
                        type="time"
                        value={startTime}
                        onChange={(e) =>
                            setStartTime(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    />

                </div>


                {/* END TIME */}
                <div>

                    <label className="block font-medium mb-2">
                        End Time
                    </label>

                    <input
                        type="time"
                        value={endTime}
                        onChange={(e) =>
                            setEndTime(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    />

                </div>


                {/* SCHEDULE TYPE */}
                <div>

                    <label className="block font-medium mb-2">
                        Schedule Type
                    </label>

                    <select
                        value={scheduleType}
                        onChange={(e) =>
                            setScheduleType(e.target.value)
                        }
                        className="w-full border rounded-lg px-4 py-2"
                    >

                        <option value="THEORY">
                            THEORY
                        </option>

                        <option value="LAB">
                            LAB
                        </option>

                    </select>

                </div>


                {/* SLOT CODE */}
                <div>

                    <label className="block font-medium mb-2">
                        Slot Code
                    </label>

                    <input
                        value={slotCode}
                        onChange={(e) =>
                            setSlotCode(e.target.value)
                        }
                        placeholder="Example: F1 or L1"
                        className="w-full border rounded-lg px-4 py-2"
                    />

                </div>

            </div>


            {/* BUTTONS */}
            <div className="flex gap-3 mt-6">

                <button
                    onClick={saveTimetable}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                >
                    {editingTimetable
                        ? "Update Timetable"
                        : "Add Timetable"}
                </button>


                <button
                    onClick={resetTimetableForm}
                    className="bg-gray-300 px-5 py-2 rounded-lg font-semibold"
                >
                    Cancel
                </button>

            </div>

        </div>

    )}

    {/* TIMETABLE LIST */}
    <div className="space-y-4">

        {timetable.map((item) => (

            <div
                key={item.timetable_id}
                className="border rounded-xl p-5"
            >

                <div className="flex justify-between items-start">

                    <div>

                        <h4 className="text-lg font-bold">
                            {item.subject}
                        </h4>

                        <p className="text-gray-500">
                            {item.teacher_name}
                            {" • "}
                            {item.employee_id}
                        </p>

                    </div>


                    <button
                        onClick={() => editTimetable(item)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold"
                    >
                        Edit
                    </button>

                </div>


                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-gray-600">

                    <p>
                        <strong>Day:</strong><br />
                        {item.day_of_week}
                    </p>


                    <p>
                        <strong>Time:</strong><br />
                        {String(item.start_time).slice(0, 5)}
                        {" - "}
                        {String(item.end_time).slice(0, 5)}
                    </p>


                    <p>
                        <strong>Classroom:</strong><br />
                        {item.building} {item.room_number}
                    </p>


                    <p>
                        <strong>Type:</strong><br />
                        {item.schedule_type}
                    </p>

                </div>


                <div className="mt-3 text-gray-500">

                    <strong>Slot:</strong>{" "}
                    {item.slot_code}

                </div>

            </div>

        ))}

    </div>

</div>
)}

                {activeTab === "allocations" && (
                    <div className="bg-transparent">
                        <HodDashboard user={user} onLogout={onLogout} embedded={true} />
                    </div>
                )}
            </main>

        </div>
    );
}

export default AdminDashboard;